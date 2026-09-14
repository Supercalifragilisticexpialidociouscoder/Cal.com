import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../config';
import { getDb } from '../db';
import type { Role, UserRow, Viewer } from './types';

interface SessionRow {
  token_hash: string;
  user_id: number;
  expires_at: string;
  last_used_at: string;
}

function hashToken(token: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace('T', ' ').slice(0, 19);
}

export function createSession(res: Response, user: UserRow, userAgent?: string): void {
  const token = crypto.randomBytes(32).toString('base64url');
  getDb()
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
       VALUES (?, ?, ?, ?)`
    )
    .run(hashToken(token), user.id, isoFromNow(config.session.ttlMs), userAgent?.slice(0, 255) ?? null);

  res.cookie(config.session.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.session.ttlMs,
  });

  // A readable, value-free hint. Lets the SPA skip the /auth/me request
  // entirely for public visitors (spec 36) without exposing anything.
  res.cookie(config.session.hintCookieName, '1', {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.session.ttlMs,
  });
}

export function destroySession(req: Request, res: Response): void {
  const token = req.cookies?.[config.session.cookieName];
  if (typeof token === 'string' && token.length > 0) {
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
  clearSessionCookies(res);
}

export function clearSessionCookies(res: Response): void {
  const base = {
    path: '/',
    sameSite: 'lax' as const,
    secure: config.isProduction,
  };
  res.clearCookie(config.session.cookieName, { ...base, httpOnly: true });
  res.clearCookie(config.session.hintCookieName, { ...base, httpOnly: false });
}

/** Revokes every session of a user - used when an account is deactivated. */
export function destroyAllSessionsForUser(userId: number): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function resolveViewer(req: Request, res: Response): Viewer | null {
  const token = req.cookies?.[config.session.cookieName];
  if (typeof token !== 'string' || token.length === 0) return null;

  const db = getDb();
  const session = db
    .prepare(
      `SELECT token_hash, user_id, expires_at, last_used_at
         FROM sessions
        WHERE token_hash = ? AND expires_at > datetime('now')`
    )
    .get(hashToken(token)) as SessionRow | undefined;

  if (!session) {
    clearSessionCookies(res);
    return null;
  }

  const user = db
    .prepare('SELECT id, name, email, role, active FROM users WHERE id = ?')
    .get(session.user_id) as Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'active'> | undefined;

  if (!user || user.active !== 1) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
    clearSessionCookies(res);
    return null;
  }

  // Sliding expiry: an admin actively using the app is not logged out mid-task.
  const lastUsed = Date.parse(`${session.last_used_at.replace(' ', 'T')}Z`);
  if (Number.isFinite(lastUsed) && Date.now() - lastUsed > config.session.refreshAfterMs) {
    db.prepare(
      `UPDATE sessions SET last_used_at = datetime('now'), expires_at = ? WHERE token_hash = ?`
    ).run(isoFromNow(config.session.ttlMs), session.token_hash);
    res.cookie(config.session.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: config.session.ttlMs,
    });
    res.cookie(config.session.hintCookieName, '1', {
      httpOnly: false,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: config.session.ttlMs,
    });
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}
