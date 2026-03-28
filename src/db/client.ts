import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import { getDatabaseUrl } from '../config.js';

// Re-export the full schema type so callers don't need to import both files
export type Database = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | null = null;
let _db: Database | null = null;

/**
 * Get or create a singleton database instance.
 * In production this reuses one connection pool for the entire process.
 * Tests call createDatabase() directly with their own pool.
 */
export function getDatabase(): Database {
  if (_db) return _db;

  _pool = new pg.Pool({ connectionString: getDatabaseUrl() });
  _db = drizzle(_pool, { schema });
  return _db;
}

/**
 * Create a fresh database instance from an existing pool.
 * This is the main injection point for tests: spin up a test pool,
 * hand it to createDatabase(), and pass the result into service functions.
 */
export function createDatabase(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}

/**
 * Gracefully shut down the connection pool.
 * Called during SIGTERM handling so containers exit cleanly.
 */
export async function closeDatabase(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
