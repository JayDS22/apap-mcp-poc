import express from 'express';
import { getConfig } from './config.js';
import { getDatabase, closeDatabase } from './db/client.js';
import { mountMcpRoutes } from './handlers/mcp.js';
import { createApiRouter } from './routes/api.js';
import { createHealthRouter } from './middleware/healthz.js';
import { requestLogger, createLogger } from './middleware/logging.js';

const logger = createLogger('server');

async function main() {
  const config = getConfig();
  const { HOST, PORT } = config;

  logger.info({ host: HOST, port: PORT, env: config.NODE_ENV }, 'Starting APAP MCP POC server');

  const db = getDatabase();
  const app = express();

  app.use(express.json());
  app.use(requestLogger());
  app.use(createHealthRouter(db));
  app.use(createApiRouter(db));

  const mcpRouter = express.Router();
  mountMcpRoutes(mcpRouter, db);
  app.use(mcpRouter);

  // Start listening
  const server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT }, `APAP MCP POC server listening on http://${HOST}:${PORT}`);
    logger.info(`  REST API:        http://${HOST}:${PORT}/capabilities`);
    logger.info(`  MCP SSE:         http://${HOST}:${PORT}/sse`);
    logger.info(`  MCP Streamable:  POST http://${HOST}:${PORT}/mcp`);
    logger.info(`  Health:          http://${HOST}:${PORT}/healthz`);
  });

  // Graceful shutdown so Docker stop doesn't leave zombie connections
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal, closing gracefully');
    server.close(async () => {
      await closeDatabase();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
