import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { mountMcpRoutes } from '../../src/handlers/mcp.js';
import {
  toTemplateRow,
  lateDeliveryTemplate,
  helloWorldTemplate,
} from '../fixtures/templates.js';
import {
  toAgreementRow,
  lateDeliveryAgreement,
} from '../fixtures/agreements.js';

// This test file exercises the full StreamableHTTP lifecycle:
// initialize -> list tools -> call tool -> verify response

function createMockDb() {
  const templateRows = [
    toTemplateRow(lateDeliveryTemplate, 1),
    toTemplateRow(helloWorldTemplate, 2),
  ];
  const agreementRows = [toAgreementRow(lateDeliveryAgreement, 1)];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([agreementRows[0]])),
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

/**
 * Helper to send a JSON-RPC request over StreamableHTTP and parse the response.
 * Handles the SSE response format that StreamableHTTP uses.
 */
async function sendMcpRequest(
  baseUrl: string,
  sessionId: string | null,
  request: Record<string, unknown>,
): Promise<{ sessionId: string; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream, application/json',
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  const newSessionId = res.headers.get('mcp-session-id') || sessionId || '';

  // StreamableHTTP may return SSE or JSON depending on the request.
  // For request/response patterns it returns SSE with the JSON-RPC response as data.
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    // Parse SSE to extract JSON-RPC response
    const text = await res.text();
    const lines = text.split('\n');
    let jsonData = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          jsonData = JSON.parse(line.slice(6));
        } catch {
          // Not all data lines are JSON (could be empty or partial)
        }
      }
    }

    return { sessionId: newSessionId, body: jsonData };
  }

  // Direct JSON response
  const body = await res.json();
  return { sessionId: newSessionId, body };
}

describe('MCP StreamableHTTP Full Lifecycle', () => {
  it('initialize -> list tools -> verify tool names', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Step 1: Initialize
      const initResult = await sendMcpRequest(baseUrl, null, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

      expect(initResult.sessionId).toBeTruthy();
      expect(initResult.body?.result?.serverInfo?.name).toBe('apap-mcp-server');

      // Step 2: Send initialized notification
      await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
          'mcp-session-id': initResult.sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });

      // Step 3: List tools
      const toolsResult = await sendMcpRequest(baseUrl, initResult.sessionId, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      // Verify all four tools are registered
      const toolNames = toolsResult.body?.result?.tools?.map((t: any) => t.name) ?? [];
      expect(toolNames).toContain('convert-agreement-to-format');
      expect(toolNames).toContain('trigger-agreement');
      expect(toolNames).toContain('getTemplate');
      expect(toolNames).toContain('getAgreement');
    } finally {
      close();
    }
  });

  it('initialize -> call getAgreement tool -> verify response', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Initialize
      const initResult = await sendMcpRequest(baseUrl, null, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

      // Initialized notification
      await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
          'mcp-session-id': initResult.sessionId,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });

      // Call getAgreement tool
      const toolResult = await sendMcpRequest(baseUrl, initResult.sessionId, {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'getAgreement',
          arguments: { agreementId: '1' },
        },
      });

      // The tool should return the agreement data as JSON text
      const content = toolResult.body?.result?.content;
      expect(content).toBeDefined();
      if (content && content.length > 0) {
        const parsed = JSON.parse(content[0].text);
        expect(parsed.id).toBe(1);
        expect(parsed.agreementStatus).toBe('DRAFT');
      }
    } finally {
      close();
    }
  });
});
