import path from 'node:path';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createHealthRouter } from './routes/health.js';
import { createLimitsRouter } from './routes/limits.js';
import type { AppServices } from './types/services.js';

export interface CreateAppOptions {
  services: AppServices;
  /** Browser origins allowed to call the API directly. */
  corsOrigins: string[];
  /** Salesforce REST API version, surfaced by /api/health. */
  apiVersion: string;
  /** `mock` tells the health endpoint that no org is contacted. */
  mode: 'live' | 'mock';
  /** When set, the built Vue app is served from this directory. */
  clientDistPath?: string;
  enableRequestLogging?: boolean;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();
  const allowedOrigins = new Set(options.corsOrigins);

  app.disable('x-powered-by');
  // Correct client IPs / protocol when running behind a reverse proxy.
  app.set('trust proxy', 1);

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header means curl, a server-to-server call, or a
        // same-origin request. Browsers always send one.
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  // A small body limit: the only payloads are a name and an industry.
  app.use(express.json({ limit: '32kb' }));

  if (options.enableRequestLogging) {
    app.use(requestLogger);
  }

  // API responses are live Salesforce data; never let a browser or proxy cache
  // them (especially not the limits snapshot).
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/health', createHealthRouter({ mode: options.mode, apiVersion: options.apiVersion }));
  app.use('/api/accounts', createAccountsRouter(options.services.accounts));
  app.use('/api/limits', createLimitsRouter(options.services.limits));

  // Unknown /api paths must be JSON, not the SPA's index.html.
  app.use('/api', notFoundHandler);

  if (options.clientDistPath) {
    const clientDistPath = options.clientDistPath;

    app.use(
      express.static(clientDistPath, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            // Vite fingerprints these filenames, so they are immutable.
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      }),
    );

    // SPA fallback: deep links (e.g. /accounts/123) get index.html, while
    // missing API routes were already answered above. A request that looks
    // like a file (e.g. /assets/index-abc.js) must 404 instead of receiving
    // HTML, otherwise the browser tries to parse the SPA shell as JavaScript.
    app.use((req, res, next) => {
      const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
      if (!isPageRequest || req.path.startsWith('/api') || !req.accepts('html')) {
        next();
        return;
      }

      if (path.extname(req.path) !== '' || req.path.startsWith('/assets/')) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }

      // index.html references hashed bundles, so it must be revalidated on
      // every load; sendFile() would otherwise default to "public, max-age=0".
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(clientDistPath, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(createErrorHandler());

  return app;
}
