import pino from 'pino';
import { getConfig } from '../config.js';

let _rootLogger: pino.Logger | null = null;

function getRootLogger(): pino.Logger {
  if (_rootLogger) return _rootLogger;

  const config = getConfig();
  const isDev = config.NODE_ENV === 'development';

  _rootLogger = pino({
    level: config.LOG_LEVEL,
    // pino-pretty only loads in dev so production stays on structured JSON.
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
      },
    }),
  });

  return _rootLogger;
}

/** Child logger scoped to a component name. */
export function createLogger(component: string): pino.Logger {
  return getRootLogger().child({ component });
}

/** Request logging middleware with duration tracking and x-request-id correlation. */
export function requestLogger() {
  const logger = createLogger('http');

  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
    res.setHeader('x-request-id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      logger.info(
        {
          requestId,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - start,
        },
        `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
      );
    });

    next();
  };
}
