import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { mountMcpRoutes } from '../../src/handlers/mcp.js';
import {
  toTemplateRow,
  lateDeliveryTemplate,
  helloWorldTemplate,
} from '../fixtures/templates.js';

// This suite mirrors the four MCP demo probes used for the GSoC mid-eval
// (initialize / resources/list / resources/read schema / tools/call
// getAgreement). If curl-based verification against the running container is
// unavailable, this suite is the empirical proof that the wiring holds
// end-to-end through the mounted Express routes.

/**
 * Mock DB where any `.limit(1)` (single-row lookup, used by getAgreementById)
 * resolves to `[]`. That drives the AGREEMENT_NOT_FOUND path so probe 4
 * matches what curl would see against a real Postgres with no row for id
 * 999999. Template list queries still return two rows.
 */
function createMockDb() {
  const templateRows = [
    toTemplateRow(lateDeliveryTemplate, 1),
    toTemplateRow(helloWorldTemplate, 2),
  ];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
        then: (fn: any) => Promise.resolve(templateRows).then(fn),
        [Symbol.toStringTag]: 'Promise',
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  } as any;
}

function createTestApp(db: any) {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  mountMcpRoutes(router, db);
  app.use(router);
  return app;
}

async function listen(app: express.Express): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ port: addr.port, close: () => server.close() });
    });
  });
}

async function sendMcp(
  baseUrl: string,
  sessionId: string | null,
  request: Record<string, unknown>,
): Promise<{ sessionId: string; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  const newSessionId = res.headers.get('mcp-session-id') || sessionId || '';
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    const text = await res.text();
    let json = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        try { json = JSON.parse(line.slice(6)); } catch { /* keep looking */ }
      }
    }
    return { sessionId: newSessionId, body: json };
  }

  const body = await res.json().catch(() => null);
  return { sessionId: newSessionId, body };
}

describe('MCP demo probes (initialize / list / read schema / getAgreement)', () => {
  it('runs all four probes against the mounted router', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // -- Probe 1: initialize must return a non-empty `instructions` string
      // -- that names the Concerto schema resource URI.
      const init = await sendMcp(baseUrl, null, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'probe', version: '1.0.0' },
        },
      });
      expect(init.body?.result?.serverInfo?.name).toBe('apap-mcp-server');
      const instructions = init.body?.result?.instructions;
      expect(typeof instructions).toBe('string');
      expect(instructions).toMatch(/Concerto/);
      expect(instructions).toMatch(/apap:\/\/schema\/protocol\.cto/);
      expect(instructions).toMatch(/\$class/);
      expect(init.sessionId).toBeTruthy();

      // notifications/initialized
      await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': init.sessionId,
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      });

      // -- Probe 2: resources/list must include the protocol-schema resource
      // -- registered at `apap://schema/protocol.cto`.
      const list = await sendMcp(baseUrl, init.sessionId, {
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {},
      });
      const resources = list.body?.result?.resources ?? [];
      const schemaResource = resources.find((r: any) => r.uri === 'apap://schema/protocol.cto');
      expect(schemaResource).toBeDefined();
      expect(schemaResource.name).toBe('protocol-schema');

      // -- Probe 3: resources/read on the schema URI returns text/x-concerto
      // -- with the bundled model bytes (~7202 chars).
      const read = await sendMcp(baseUrl, init.sessionId, {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/read',
        params: { uri: 'apap://schema/protocol.cto' },
      });
      const contents = read.body?.result?.contents;
      expect(contents).toBeDefined();
      expect(contents).toHaveLength(1);
      expect(contents[0].uri).toBe('apap://schema/protocol.cto');
      expect(contents[0].mimeType).toBe('text/x-concerto');
      expect(contents[0].text).toContain('namespace org.accordproject.protocol');
      expect(contents[0].text.length).toBeGreaterThan(7000);
      expect(contents[0].text.length).toBeLessThan(7500);

      // -- Probe 4: tools/call getAgreement 999999 -> AGREEMENT_NOT_FOUND
      // -- structured payload from the ServiceError -> handleToolError path.
      const tool = await sendMcp(baseUrl, init.sessionId, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'getAgreement', arguments: { agreementId: '999999' } },
      });
      expect(tool.body?.result?.isError).toBe(true);
      const payload = JSON.parse(tool.body.result.content[0].text);
      expect(payload.error.code).toBe('AGREEMENT_NOT_FOUND');
      // ServiceError.toJSON() emits { error: { code, message, details? } }.
      // The 404 is the REST-side status; on the MCP side we assert on the
      // structured code + message the LLM actually sees.
      expect(payload.error.message).toMatch(/Agreement not found/);
      expect(payload.error.details).toMatchObject({ identifier: 999999 });
    } finally {
      close();
    }
  });
});
