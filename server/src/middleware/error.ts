import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { AppError } from '../lib/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: `No API route matches ${req.method} ${req.path}.`,
    },
  });
}

/**
 * Turns anything thrown inside a route into a friendly sentence (spec 41).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `That file is too large. The maximum size is ${Math.round(
            config.uploads.maxBytes / (1024 * 1024)
          )} MB.`
        : 'We could not accept that upload. Please check the file and try again.';
    res.status(400).json({ error: { code: 'upload_failed', message } });
    return;
  }

  if (isBodyParseError(err)) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'We could not read that request. Please try again.' },
    });
    return;
  }

  // Genuinely unexpected: log for the operator, stay friendly for the user.
  console.error('[mrtc-calendar] unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'server_error',
      message: 'Something went wrong on our side. Please try again in a moment.',
    },
  });
}

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type?: unknown }).type === 'string' &&
    ((err as { type: string }).type === 'entity.parse.failed' ||
      (err as { type: string }).type === 'entity.too.large')
  );
}

/** Wraps an async route handler so rejected promises reach the error handler. */
export function asyncRoute<T extends (req: Request, res: Response, next: NextFunction) => unknown>(
  handler: T
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
