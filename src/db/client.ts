import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { getDatabaseUrl } from '../config.js';

export type Database = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | null = null;
let _db: Database | null = null;

/** Singleton pool for production. Tests use createDatabase() with their own pool instead. */
export function getDatabase(): Database {
  if (_db) return _db;

  _pool = new pg.Pool({ connectionString: getDatabaseUrl() });
  _db = drizzle(_pool, { schema });
  return _db;
}

/** Test injection point: bring your own pool, get a typed db handle back. */
export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

/** Drain the pool on SIGTERM so containers exit without zombie connections. */
export async function closeDatabase(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
