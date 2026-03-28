import express, { Request, Response } from 'express';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as crypto from 'crypto';
import { z } from 'zod';

import type { Database } from '../db/client.js';
import {
  listTemplates,
  getTemplateById,
  listAgreements,
  getAgreementById,
  convertAgreement,
  triggerAgreement,
  ServiceError,
} from '../services/index.js';
import { createLogger } from '../middleware/logging.js';

const logger = createLogger('mcp-handler');

// Session-to-transport maps. StreamableHTTP needs this so follow-up
// requests get routed to the transport that handled initialization.
const transports: Record<string, StreamableHTTPServerTransport> = {};
const sseTransports: Record<string, SSEServerTransport> = {};

/**
 * Build the McpServer with all tool and resource registrations.
 *
 * This is where the refactor lives: every handler calls the shared service
 * layer directly instead of looping back through makeApiRequest -> fetch ->
 * Express -> handler -> DB. The internal HTTP round-trip is gone.
 */
function createMcpServer(db: Database): McpServer {
  const server = new McpServer(
    { name: 'apap-mcp-server', version: '1.0.0' },
    { capabilities: { logging: {} } },
  );

  // -- Resources --

  // List all templates
  server.resource('templates', 'apap://templates', async (uri: URL) => {
    const templates = await listTemplates(db);
    return {
      contents: templates.map((t) => ({
        uri: `apap://templates/${t.id}`,
        mimeType: 'application/json' as const,
        text: JSON.stringify(t),
      })),
    };
  });

  // List all agreements
  server.resource('agreements', 'apap://agreements', async (uri: URL) => {
    const agreements = await listAgreements(db);
    return {
      contents: agreements.map((a) => ({
        uri: `apap://agreements/${a.id}`,
        mimeType: 'application/json' as const,
        text: JSON.stringify({ ...a.data as object, $identifier: a.id }, null, 2),
      })),
    };
  });

  // Parameterized agreement resource
  server.resource(
    'agreement',
    new ResourceTemplate('apap://agreements/{agreementId}', {
      list: async () => {
        const agreements = await listAgreements(db);
        return {
          resources: agreements.map((a) => ({
            name: `agreement-${a.id}`,
            uri: `apap://agreements/${a.id}`,
          })),
        };
      },
    }),
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const rawId = Array.isArray(variables.agreementId) ? variables.agreementId[0] : variables.agreementId;
      const id = parseInt(rawId, 10);
      const agreement = await getAgreementById(db, id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json' as const,
            text: JSON.stringify(agreement),
          },
        ],
      };
    },
  );

  // Parameterized template resource
  server.resource(
    'template',
    new ResourceTemplate('apap://templates/{templateId}', {
      list: async () => {
        const templates = await listTemplates(db);
        return {
          resources: templates.map((t) => ({
            name: `template-${t.id}`,
            uri: `apap://templates/${t.id}`,
          })),
        };
      },
    }),
    async (uri: URL, variables: Record<string, string | string[]>) => {
      const rawId = Array.isArray(variables.templateId) ? variables.templateId[0] : variables.templateId;
      const id = parseInt(rawId, 10);
      const template = await getTemplateById(db, id);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: 'application/json' as const,
            text: JSON.stringify(template),
          },
        ],
      };
    },
  );

  // -- Tools --

  // Convert agreement to HTML or Markdown
  server.tool(
    'convert-agreement-to-format',
    'Converts an existing agreement to an output format',
    { agreementId: z.string(), format: z.enum(['html', 'markdown']) },
    async ({ agreementId, format }): Promise<CallToolResult> => {
      const start = Date.now();
      try {
        const id = parseInt(agreementId, 10);
        const text = await convertAgreement(db, id, format);
        logger.info({ tool: 'convert-agreement-to-format', agreementId, format, durationMs: Date.now() - start }, 'Tool executed');
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return handleToolError(err, 'convert-agreement-to-format');
      }
    },
  );

  // Trigger agreement logic
  server.tool(
    'trigger-agreement',
    `Sends JSON data (as a string) to an existing agreement, evaluating the logic of the agreement against the input data.
The schema for the JSON object must be one of the transaction types which extend 'Request' defined in the model for the agreement's template.
Refer to the agreement's template model to determine which fields are required or optional.`,
    { agreementId: z.string(), payload: z.string() },
    async ({ agreementId, payload }): Promise<CallToolResult> => {
      const start = Date.now();
      try {
        const id = parseInt(agreementId, 10);
        const result = await triggerAgreement(db, id, payload);
        logger.info({ tool: 'trigger-agreement', agreementId, durationMs: Date.now() - start }, 'Tool executed');
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (err) {
        return handleToolError(err, 'trigger-agreement');
      }
    },
  );

  // Get template by ID
  server.tool(
    'getTemplate',
    'Retrieve a template by ID',
    { templateId: z.string() },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ templateId }): Promise<CallToolResult> => {
      const start = Date.now();
      try {
        const id = parseInt(templateId, 10);
        const template = await getTemplateById(db, id);
        logger.info({ tool: 'getTemplate', templateId, durationMs: Date.now() - start }, 'Tool executed');
        return { content: [{ type: 'text', text: JSON.stringify(template) }] };
      } catch (err) {
        return handleToolError(err, 'getTemplate');
      }
    },
  );

  // Get agreement by ID
  server.tool(
    'getAgreement',
    'Retrieve an agreement by ID',
    { agreementId: z.string() },
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ agreementId }): Promise<CallToolResult> => {
      const start = Date.now();
      try {
        const id = parseInt(agreementId, 10);
        const agreement = await getAgreementById(db, id);
        logger.info({ tool: 'getAgreement', agreementId, durationMs: Date.now() - start }, 'Tool executed');
        return { content: [{ type: 'text', text: JSON.stringify(agreement) }] };
      } catch (err) {
        return handleToolError(err, 'getAgreement');
      }
    },
  );

  return server;
}

/** ServiceErrors get structured responses. Everything else is a 500 with a generic message. */
function handleToolError(err: unknown, toolName: string): CallToolResult {
  if (err instanceof ServiceError) {
    logger.warn({ tool: toolName, errorCode: err.code, statusCode: err.statusCode }, err.message);
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(err.toJSON()) }],
    };
  }

  // Unexpected error - log the full stack, return a generic message to the client
  logger.error({ tool: toolName, err }, 'Unexpected tool error');
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }) }],
  };
}

/**
 * Mount MCP transport endpoints on an Express router.
 * Supports SSE (legacy, 2024-11-05) and StreamableHTTP (current, 2025-03-26).
 */
export function mountMcpRoutes(router: express.Router, db: Database): void {
  // -- StreamableHTTP transport --

  router.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    try {
      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            logger.info({ sessionId: sid }, 'StreamableHTTP session initialized');
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logger.info({ sessionId: sid }, 'StreamableHTTP session closed');
            delete transports[sid];
          }
        };

        const server = createMcpServer(db);
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error({ err }, 'Error handling MCP StreamableHTTP request');
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  router.get('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID' },
        id: null,
      });
      return;
    }
    // SSE stream for server-to-client notifications
    await transports[sessionId].handleRequest(req, res);
  });

  router.delete('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID' },
        id: null,
      });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // -- SSE transport (legacy, deprecated) --

  router.get('/sse', async (req: Request, res: Response) => {
    try {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      sseTransports[sessionId] = transport;

      logger.info({ sessionId }, 'SSE session started');

      transport.onclose = () => {
        logger.info({ sessionId }, 'SSE session closed');
        delete sseTransports[sessionId];
      };

      const server = createMcpServer(db);
      await server.connect(transport);
    } catch (err) {
      logger.error({ err }, 'Error setting up SSE transport');
      if (!res.headersSent) {
        res.status(500).end();
      }
    }
  });

  router.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId || !sseTransports[sessionId]) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    await sseTransports[sessionId].handlePostMessage(req, res, req.body);
  });
}
