import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors';
import { resolveViewer } from '../lib/session';
import type { Viewer } from '../lib/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewer: Viewer | null;
    }
  }
}

/** Resolves the session (if any) for every request. Never rejects. */
export function attachViewer(req: Request, res: Response, next: NextFunction): void {
  try {
    req.viewer = resolveViewer(req, res);
  } catch {
    req.viewer = null;
  }
  next();
}

/** Any authenticated administrator (super admin or one of the two staff admins). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.viewer) {
    next(unauthorized('Please sign in as an administrator to do that.'));
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.viewer) {
    next(unauthorized('Please sign in as an administrator to do that.'));
    return;
  }
  if (req.viewer.role !== 'super_admin') {
    next(forbidden('Only the Super Admin can manage this.'));
    return;
  }
  next();
}

export function assertAdmin(req: Request): Viewer {
  if (!req.viewer) throw unauthorized('Please sign in as an administrator to do that.');
  return req.viewer;
}
