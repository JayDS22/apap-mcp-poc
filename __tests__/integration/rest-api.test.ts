import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createApiRouter } from '../../src/routes/api.js';
import {
  lateDeliveryTemplate,
  helloWorldTemplate,
  toTemplateRow,
} from '../fixtures/templates.js';
import {
  lateDeliveryAgreement,
  toAgreementRow,
  lateDeliveryTriggerPayload,
} from '../fixtures/agreements.js';
import { lateDeliveryTemplate as ldTemplate, toTemplateRow as toTR } from '../fixtures/templates.js';

// Lightweight HTTP testing without pulling in supertest.
// We start a real Express app on a random port and use native fetch.
function createTestApp(db: any) {
  const app = express();
  app.use(express.json());
  app.use(createApiRouter(db));
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

// Build a mock DB that returns canned data for known query patterns.
// This is slightly more sophisticated than the unit test mock because
// integration tests exercise the full route -> service -> (mock) db flow.
function createIntegrationMockDb() {
  let queryResults: any[][] = [];
  let queryIndex = 0;

  const mock: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn(function () {
      // If there are sequential results queued, use the next one
      if (queryResults.length > 0) {
        const result = queryResults[queryIndex] ?? [];
        // Don't auto-advance for chained calls - only for terminal calls
        return {
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              const r = queryResults[queryIndex] ?? [];
              queryIndex++;
              return Promise.resolve(r);
            }),
            returning: vi.fn(() => {
              const r = queryResults[queryIndex] ?? [];
              queryIndex++;
              return Promise.resolve(r);
            }),
          })),
          // Terminal: no where clause (listTemplates/listAgreements)
          then: (fn: any) => Promise.resolve(result).then(fn),
          // Make it thenable for await
          [Symbol.toStringTag]: 'Promise',
        };
      }
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      const r = queryResults[queryIndex] ?? [];
      queryIndex++;
      return Promise.resolve(r);
    }),
    returning: vi.fn(() => {
      const r = queryResults[queryIndex] ?? [];
      queryIndex++;
      return Promise.resolve(r);
    }),
    delete: vi.fn().mockReturnThis(),
  };

  mock._setResults = (results: any[][]) => {
    queryResults = results;
    queryIndex = 0;
  };

  return mock;
}

describe('REST API Integration', () => {
  let db: ReturnType<typeof createIntegrationMockDb>;

  beforeEach(() => {
    db = createIntegrationMockDb();
  });

  describe('GET /capabilities', () => {
    it('returns the APAP capability list', async () => {
      const app = createTestApp(db);
      const { port, close } = await listen(app);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/capabilities`);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body).toContain('TEMPLATE_MANAGE');
        expect(body).toContain('AGREEMENT_MANAGE');
        expect(body).toContain('AGREEMENT_CONVERT_HTML');
      } finally {
        close();
      }
    });
  });

  describe('GET /templates', () => {
    it('returns a list of templates', async () => {
      const rows = [
        toTemplateRow(lateDeliveryTemplate, 1),
        toTemplateRow(helloWorldTemplate, 2),
      ];

      // Override from() to return rows directly (no where/limit chain)
      db.select.mockReturnValue({
        from: vi.fn().mockResolvedValue(rows),
      });

      const app = createTestApp(db);
      const { port, close } = await listen(app);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/templates`);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.items).toHaveLength(2);
        expect(body.count).toBe(2);
      } finally {
        close();
      }
    });
  });

  describe('POST /agreements/:id/trigger', () => {
    it('returns 400 for invalid JSON payload shape', async () => {
      // triggerAgreement validates the payload before hitting the DB,
      // so we don't need to mock any DB results for this case.
      const app = createTestApp(db);
      const { port, close } = await listen(app);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/agreements/1/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Express parses this as a JSON array, which triggerAgreement rejects
          body: JSON.stringify([1, 2, 3]),
        });
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error.code).toBe('INVALID_PAYLOAD');
      } finally {
        close();
      }
    });
  });

  describe('Error propagation', () => {
    it('maps ServiceError to correct HTTP status', async () => {
      // getAgreementById will throw AgreementNotFoundError when the row is missing
      db._setResults([[]]);

      const app = createTestApp(db);
      const { port, close } = await listen(app);

      try {
        const res = await fetch(`http://127.0.0.1:${port}/agreements/9999`);
        const body = await res.json();

        expect(res.status).toBe(404);
        expect(body.error.code).toBe('AGREEMENT_NOT_FOUND');
      } finally {
        close();
      }
    });
  });
});
