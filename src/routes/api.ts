import { Router, Request, Response, NextFunction } from 'express';
import type { Database } from '../db/client.js';
import {
  listTemplates,
  getTemplateById,
  getTemplateByUri,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listAgreements,
  getAgreementById,
  createAgreement,
  updateAgreement,
  deleteAgreement,
  convertAgreement,
  triggerAgreement,
  ServiceError,
} from '../services/index.js';
import { createLogger } from '../middleware/logging.js';

const logger = createLogger('rest-api');

/** Express 5 params can be string | string[]. This unwraps them. */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

/**
 * REST routes. Same service functions as the MCP handler --
 * fix a bug in the service layer, both consumers get the fix.
 */
export function createApiRouter(db: Database): Router {
  const router = Router();

  // -- Capabilities --
  router.get('/capabilities', (_req: Request, res: Response) => {
    res.json([
      'TEMPLATE_MANAGE',
      'AGREEMENT_MANAGE',
      'SHARED_MODEL_MANAGE',
      'AGREEMENT_CONVERT_HTML',
    ]);
  });

  // -- Templates --

  router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await listTemplates(db);
      res.json({ items: templates, count: templates.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/templates/:uri', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uriParam = param(req.params.uri);
      const maybeId = parseInt(uriParam, 10);
      const template = isNaN(maybeId)
        ? await getTemplateByUri(db, decodeURIComponent(uriParam))
        : await getTemplateById(db, maybeId);
      res.json(template);
    } catch (err) {
      next(err);
    }
  });

  router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await createTemplate(db, req.body);
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  });

  router.put('/templates/:uri', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await updateTemplate(db, decodeURIComponent(param(req.params.uri)), req.body);
      res.status(202).json(template);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/templates/:uri', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteTemplate(db, decodeURIComponent(param(req.params.uri)));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // -- Agreements --

  router.get('/agreements', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const agreements = await listAgreements(db);
      res.json({ items: agreements, count: agreements.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/agreements/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(param(req.params.id), 10);
      const agreement = await getAgreementById(db, id);
      res.json(agreement);
    } catch (err) {
      next(err);
    }
  });

  router.post('/agreements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agreement = await createAgreement(db, req.body);
      res.status(201).json(agreement);
    } catch (err) {
      next(err);
    }
  });

  router.put('/agreements/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(param(req.params.id), 10);
      const agreement = await updateAgreement(db, id, req.body);
      res.status(202).json(agreement);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/agreements/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(param(req.params.id), 10);
      await deleteAgreement(db, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // -- Agreement operations --

  router.get('/agreements/:id/convert/:format', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(param(req.params.id), 10);
      const format = param(req.params.format) as 'html' | 'markdown';
      if (format !== 'html' && format !== 'markdown') {
        res.status(400).json({ error: { code: 'INVALID_FORMAT', message: 'Format must be html or markdown' } });
        return;
      }
      const output = await convertAgreement(db, id, format);
      const contentType = format === 'html' ? 'text/html' : 'text/markdown';
      res.setHeader('Content-Type', contentType);
      res.send(output);
    } catch (err) {
      next(err);
    }
  });

  router.post('/agreements/:id/trigger', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(param(req.params.id), 10);
      const payload = JSON.stringify(req.body);
      const result = await triggerAgreement(db, id, payload);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // -- Error handler --
  // ServiceErrors carry statusCode and a toJSON() method.
  // Everything else is an unexpected 500.

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) {
      logger.warn({ errorCode: err.code, statusCode: err.statusCode }, err.message);
      res.status(err.statusCode).json(err.toJSON());
      return;
    }

    logger.error({ err }, 'Unexpected REST API error');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  return router;
}
