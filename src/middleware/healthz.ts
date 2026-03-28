import { Router, Request, Response } from 'express';
import type { Database } from '../db/client.js';
import { sql } from 'drizzle-orm';

/**
 * /healthz returns 200 when the server can reach Postgres, 503 otherwise.
 * Docker Compose uses this for the healthcheck directive so dependent
 * services know when the server is actually ready to take traffic.
 */
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
