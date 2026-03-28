#!/usr/bin/env node

// startup.js - Push the DB schema then start the server.
// This avoids the drizzle-kit CLI interactive prompt that breaks in Docker.
// Usage: node startup.js

import { execSync } from 'child_process';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 2000;

async function waitForPostgres() {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '1baddeed',
    database: process.env.POSTGRES_DATABASE || 'postgres',
  });

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      console.log('[startup] Postgres is ready');
      return;
    } catch (err) {
      console.log(`[startup] Waiting for Postgres (attempt ${i + 1}/${MAX_RETRIES})...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  await pool.end();
  console.error('[startup] Could not connect to Postgres after retries');
  process.exit(1);
}

async function pushSchema() {
  console.log('[startup] Pushing database schema...');
  try {
    // Use drizzle-kit push with a piped 'Yes' to handle the interactive prompt.
    // The --config flag ensures it finds our drizzle.config.ts.
    execSync('echo "Yes" | npx drizzle-kit push', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    console.log('[startup] Schema push complete');
  } catch (err) {
    console.error('[startup] Schema push failed:', err.message);
    console.log('[startup] Continuing anyway - schema may already exist');
  }
}

async function startServer() {
  console.log('[startup] Starting server...');
  // Import and run the server. Dynamic import so this script stays light.
  await import('./dist/index.js');
}

async function main() {
  await waitForPostgres();
  await pushSchema();
  await startServer();
}

main().catch((err) => {
  console.error('[startup] Fatal error:', err);
  process.exit(1);
});
