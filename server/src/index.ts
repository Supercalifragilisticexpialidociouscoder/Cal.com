import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { getDb, pruneExpiredSessions } from './db';
import { ensureSeedData } from './db/seed';
import { attachViewer } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { corsMiddleware, csrfGuard, startRateLimitCleanup } from './middleware/security';
import { adminRouter } from './routes/admin';
import { attachmentsRouter } from './routes/attachments';
import { authRouter } from './routes/auth';
import { eventNotesRouter } from './routes/eventNotes';
import { eventsRouter } from './routes/events';
import { metaRouter } from './routes/meta';
import { overviewRouter } from './routes/overview';
import { quickNotesRouter } from './routes/quickNotes';
import { responsibilitiesRouter } from './routes/responsibilities';
import { searchRouter } from './routes/search';

export function createApp(): express.Express {
  const app = express();

  // Behind a reverse proxy in production, so secure cookies and req.ip work.
  if (config.isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          // React sets style attributes; no inline <script> is ever served.
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  app.use(compression());
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use('/api', attachViewer, csrfGuard);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'infin8-calendar-api', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/overview', overviewRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/meta', metaRouter);
  app.use('/api/notes', quickNotesRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/admin', adminRouter);
  // These routers declare full paths because they span several resources.
  app.use('/api', responsibilitiesRouter);
  app.use('/api', eventNotesRouter);
  app.use('/api', attachmentsRouter);

  app.use('/api', notFoundHandler);

  // In production this process also serves the built single page app.
  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistDir, {
        index: false,
        setHeaders(res, filePath) {
          // Vite emits content hashed asset names, so they can be cached hard.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
        },
      })
    );

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}

function start(): void {
  getDb();
  ensureSeedData();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[infin8-calendar] API listening on http://localhost:${config.port}`);
    if (!config.isProduction) {
      console.log('[infin8-calendar] web client: http://localhost:5173');
    }
  });

  pruneExpiredSessions();
  const sessionSweeper = setInterval(pruneExpiredSessions, 1000 * 60 * 30);
  sessionSweeper.unref();
  startRateLimitCleanup();

  const shutdown = (signal: string) => {
    console.log(`[infin8-calendar] ${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start();
}
