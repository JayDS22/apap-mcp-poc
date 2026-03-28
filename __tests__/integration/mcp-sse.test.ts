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

// Stand up a real Express server with MCP routes and a mock DB,
// then exercise the SSE transport the way MCP Inspector would.

function createMockDb() {
  const templateRows = [
    toTemplateRow(lateDeliveryTemplate, 1),
    toTemplateRow(helloWorldTemplate, 2),
  ];
  const agreementRows = [toAgreementRow(lateDeliveryAgreement, 1)];

  // Build a mock that handles the common query chains.
  // The key insight: MCP tools call service functions which call
  // db.select().from(X).where(...).limit(1), and list functions
  // call db.select().from(X).
  const mock: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        // Determine which table is being queried by checking the table name
        // This is a simplification; in real code Drizzle uses table references
        const rows = table?.Symbol?.for?.('drizzle:Name') === 'Template'
          ? templateRows
          : agreementRows;

        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(rows.length > 0 ? [rows[0]] : [])),
          })),
          then: (fn: any) => Promise.resolve(rows).then(fn),
          [Symbol.toStringTag]: 'Promise',
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };

  return mock;
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

describe('MCP SSE Transport Integration', () => {
  it('establishes an SSE connection and receives the endpoint event', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);

    try {
      // Connect to the SSE endpoint. The first event should be the
      // "endpoint" event telling us where to POST messages.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`http://127.0.0.1:${port}/sse`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      // Read the first SSE event
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let endpointUrl = '';

      // Read chunks until we find the endpoint event
      while (!endpointUrl) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = buffer.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('data: ')) {
            const data = lines[i].slice(6).trim();
            if (data.includes('/messages?sessionId=')) {
              endpointUrl = data;
              break;
            }
          }
        }
      }

      clearTimeout(timeout);
      reader.cancel();

      expect(endpointUrl).toContain('/messages?sessionId=');
    } finally {
      close();
    }
  });
});

describe('MCP StreamableHTTP Transport Integration', () => {
  it('initializes a session via POST /mcp', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);

    try {
      // Send an initialize request (JSON-RPC)
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      };

      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify(initRequest),
      });

      // StreamableHTTP should respond with the session ID in a header
      expect(res.status).toBe(200);
      const sessionId = res.headers.get('mcp-session-id');
      expect(sessionId).toBeTruthy();
    } finally {
      close();
    }
  });

  it('rejects POST /mcp without session ID or initialize request', async () => {
    const db = createMockDb();
    const app = createTestApp(db);
    const { port, close } = await listen(app);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toContain('No valid session ID');
    } finally {
      close();
    }
  });
});
