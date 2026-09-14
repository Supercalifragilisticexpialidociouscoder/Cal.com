import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { forbidden } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection without a token round trip.
 *
 * The session cookie is SameSite=Lax, so a cross-site form post cannot carry
 * it. On top of that, every state changing request must come from an allowed
 * origin and carry a custom header, which a simple cross-origin form cannot
 * set without a successful CORS preflight.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const requestedWith = req.get('x-requested-with');
  if (requestedWith !== 'infin8-calendar') {
    next(forbidden('This request was blocked for security reasons. Please reload the page and try again.'));
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    const allowed =
      config.corsOrigins.includes(origin) || origin === `${req.protocol}://${req.get('host')}`;
    if (!allowed) {
      next(forbidden('This request came from an unrecognised origin and was blocked.'));
      return;
    }
  }

  next();
}

/** Credentialed CORS, restricted to the configured origins. */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.get('origin');
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

interface Attempt {
  count: number;
  firstAt: number;
}

const attempts = new Map<string, Attempt>();

/** Simple in-process throttle for the login endpoint. */
export function loginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = attempts.get(key);

  if (!existing || now - existing.firstAt > config.login.windowMs) {
    attempts.set(key, { count: 1, firstAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > config.login.maxAttempts) {
    const retryAfterSeconds = Math.ceil((config.login.windowMs - (now - existing.firstAt)) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}

/** Periodically drops stale throttle entries so the map cannot grow forever. */
export function startRateLimitCleanup(): NodeJS.Timeout {
  const timer = setInterval(() => {
    const cutoff = Date.now() - config.login.windowMs;
    for (const [key, value] of attempts) {
      if (value.firstAt < cutoff) attempts.delete(key);
    }
  }, config.login.windowMs).unref();
  return timer;
}
