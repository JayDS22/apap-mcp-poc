import { Router, Request, Response } from 'express';
import type { Database } from '../db/client.js';
import { sql } from 'drizzle-orm';

/** /healthz -- 200 when Postgres is reachable, 503 otherwise. Used by Docker healthcheck. */
export function createHealthRouter(db: Database): Router {
  const router = Router();

  router.get('/healthz', async (_req: Request, res: Response) => {
    try {
      // Run a trivial query to prove we have a live DB connection
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({
        status: 'unhealthy',
        error: err instanceof Error ? err.message : 'Database connection failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
