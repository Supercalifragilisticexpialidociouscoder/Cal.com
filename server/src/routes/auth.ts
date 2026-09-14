import { Router } from 'express';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { badRequest, tooManyRequests, unauthorized } from '../lib/errors';
import { fakeVerifyDelay, hashPassword, verifyPassword } from '../lib/password';
import { createSession, destroyAllSessionsForUser, destroySession } from '../lib/session';
import { serializeViewer } from '../lib/serialize';
import type { UserRow } from '../lib/types';
import { loginSchema, parseBody, passwordChangeSchema } from '../lib/validate';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';
import { clearLoginAttempts, loginRateLimit } from '../middleware/security';

export const authRouter = Router();

function findUserByIdentifier(identifier: string): UserRow | undefined {
  const db = getDb();
  const value = identifier.trim();

  const exact = db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(value) as UserRow | undefined;
  if (exact) return exact;

  // Allow signing in with just the local part ("abhi" for abhi@admin.cal8).
  if (!value.includes('@') && value.length > 0) {
    return db
      .prepare(`SELECT * FROM users WHERE email LIKE ? COLLATE NOCASE LIMIT 2`)
      .all(`${value}@%`)
      .filter((row): row is UserRow => Boolean(row))
      .at(0);
  }
  return undefined;
}

authRouter.post(
  '/login',
  asyncRoute((req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);

    const throttleKey = `${req.ip ?? 'unknown'}|${email.toLowerCase()}`;
    const throttle = loginRateLimit(throttleKey);
    if (!throttle.allowed) {
      throw tooManyRequests(
        `Too many sign-in attempts. Please wait ${Math.ceil(
          throttle.retryAfterSeconds / 60
        )} minute(s) and try again.`
      );
    }

    const user = findUserByIdentifier(email);

    if (!user) {
      // Spend the same time as a real check so timing reveals nothing.
      fakeVerifyDelay();
      throw unauthorized('Incorrect username or password.');
    }
    if (!verifyPassword(password, user.password_hash)) {
      throw unauthorized('Incorrect username or password.');
    }
    if (user.active !== 1) {
      throw unauthorized('This administrator account has been deactivated.');
    }

    clearLoginAttempts(throttleKey);
    createSession(res, user, req.get('user-agent') ?? undefined);
    logActivity('admin.signed_in', {
      viewer: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

    res.json({
      user: serializeViewer({ id: user.id, name: user.name, email: user.email, role: user.role }),
    });
  })
);

authRouter.post(
  '/logout',
  asyncRoute((req, res) => {
    destroySession(req, res);
    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  asyncRoute((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: req.viewer ? serializeViewer(req.viewer) : null });
  })
);

authRouter.post(
  '/password',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const { current_password, new_password } = parseBody(passwordChangeSchema, req.body);

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(viewer.id) as
      | UserRow
      | undefined;
    if (!user) throw unauthorized('Please sign in again.');

    if (!verifyPassword(current_password, user.password_hash)) {
      throw badRequest('Your current password is not correct.');
    }
    if (verifyPassword(new_password, user.password_hash)) {
      throw badRequest('Please choose a password you have not used here before.');
    }

    db.prepare(
      `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(hashPassword(new_password), viewer.id);

    // Force every other device to sign in again, then re-establish this one.
    destroyAllSessionsForUser(viewer.id);
    createSession(res, { ...user, password_hash: '' }, req.get('user-agent') ?? undefined);
    logActivity('admin.password_changed', { viewer });

    res.json({ ok: true });
  })
);
