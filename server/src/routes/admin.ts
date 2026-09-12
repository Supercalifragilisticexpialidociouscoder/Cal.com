import { Router } from 'express';
import { config, MAX_STAFF_ADMINS } from '../config';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { destroyAllSessionsForUser } from '../lib/session';
import { EVENT_ORDER_BY, presentEvents } from '../lib/eventPresenter';
import type { EventRow, UserRow } from '../lib/types';
import { parseBody, staffAdminCreateSchema, staffAdminUpdateSchema } from '../lib/validate';
import { assertAdmin, requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const adminRouter = Router();

function publicUser(row: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'active' | 'created_at'>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active === 1,
    created_at: row.created_at,
  };
}

/** GET /api/admin/users - the administrator roster (Super Admin only). */
adminRouter.get(
  '/users',
  requireSuperAdmin,
  asyncRoute((_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT id, name, email, role, active, created_at FROM users
          ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END, name`
      )
      .all() as Array<Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'active' | 'created_at'>>;

    const activeStaff = rows.filter((row) => row.role === 'staff_admin' && row.active === 1).length;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      users: rows.map(publicUser),
      staff_admin_slots: { used: activeStaff, total: MAX_STAFF_ADMINS },
    });
  })
);

/**
 * POST /api/admin/users - add a staff admin.
 * Only two staff admin accounts are authorised, enforced here on the server.
 */
adminRouter.post(
  '/users',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const input = parseBody(staffAdminCreateSchema, req.body);

    const db = getDb();
    const activeStaff = (
      db
        .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'staff_admin' AND active = 1`)
        .get() as { count: number }
    ).count;

    if (activeStaff >= MAX_STAFF_ADMINS) {
      throw conflict(
        `Both Staff Admin places are in use. Deactivate one of the existing Staff Admins before adding another.`
      );
    }

    const duplicate = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(input.email) as
      | { id: number }
      | undefined;
    if (duplicate) throw conflict('An administrator with that email address already exists.');

    const result = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, active)
         VALUES (?, ?, ?, 'staff_admin', 1)`
      )
      .run(input.name, input.email, hashPassword(input.password));

    logActivity('admin.staff_created', { viewer, metadata: { email: input.email } });

    const row = db
      .prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as Pick<
      UserRow,
      'id' | 'name' | 'email' | 'role' | 'active' | 'created_at'
    >;
    res.status(201).json({ user: publicUser(row) });
  })
);

adminRouter.patch(
  '/users/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That administrator no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!existing) throw notFound('That administrator no longer exists.');

    const input = parseBody(staffAdminUpdateSchema, req.body);

    if (existing.role === 'super_admin') {
      // The single Super Admin account cannot be renamed away or disabled here;
      // it changes its own password through /api/auth/password.
      if (input.active === false) throw forbidden('The Super Admin account cannot be deactivated.');
      if (input.password) {
        throw forbidden('Please change the Super Admin password from Account settings.');
      }
    }

    if (input.email && input.email !== existing.email.toLowerCase()) {
      const duplicate = db
        .prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?')
        .get(input.email, id) as { id: number } | undefined;
      if (duplicate) throw conflict('An administrator with that email address already exists.');
    }

    if (input.active === true && existing.role === 'staff_admin' && existing.active === 0) {
      const activeStaff = (
        db
          .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'staff_admin' AND active = 1`)
          .get() as { count: number }
      ).count;
      if (activeStaff >= MAX_STAFF_ADMINS) {
        throw conflict('Both Staff Admin places are already in use.');
      }
    }

    const nextActive = input.active === undefined ? existing.active === 1 : input.active;

    db.prepare(
      `UPDATE users
          SET name = ?, email = ?, password_hash = ?, active = ?, updated_at = datetime('now')
        WHERE id = ?`
    ).run(
      input.name ?? existing.name,
      input.email ?? existing.email,
      input.password ? hashPassword(input.password) : existing.password_hash,
      nextActive ? 1 : 0,
      id
    );

    // Changing a password or disabling an account ends its open sessions.
    if (input.password || nextActive === false) destroyAllSessionsForUser(id);

    logActivity('admin.staff_updated', {
      viewer,
      metadata: { email: input.email ?? existing.email, active: nextActive },
    });

    const row = db
      .prepare('SELECT id, name, email, role, active, created_at FROM users WHERE id = ?')
      .get(id) as Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'active' | 'created_at'>;
    res.json({ user: publicUser(row) });
  })
);

/** DELETE /api/admin/users/:id - deactivates, freeing one of the two places. */
adminRouter.delete(
  '/users/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That administrator no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    if (!existing) throw notFound('That administrator no longer exists.');
    if (existing.role === 'super_admin') throw forbidden('The Super Admin account cannot be removed.');

    db.prepare(`UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    destroyAllSessionsForUser(id);
    logActivity('admin.staff_deactivated', { viewer, metadata: { email: existing.email } });

    res.json({ ok: true });
  })
);

/** GET /api/admin/archive - soft deleted events, so nothing is truly lost. */
adminRouter.get(
  '/archive',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const rows = getDb()
      .prepare(
        `SELECT e.* FROM events e
          WHERE e.deleted_at IS NOT NULL
          ORDER BY e.deleted_at DESC
          LIMIT 100`
      )
      .all() as EventRow[];

    res.setHeader('Cache-Control', 'no-store');
    res.json({ events: presentEvents(rows, viewer) });
  })
);

/** GET /api/admin/activity - recent changes across every event (spec 25). */
adminRouter.get(
  '/activity',
  requireAdmin,
  asyncRoute((req, res) => {
    assertAdmin(req);
    const rows = getDb()
      .prepare(
        `SELECT a.id, a.action, a.metadata, a.created_at, a.event_id,
                u.name AS user_name, e.title AS event_title
           FROM activity_log a
           LEFT JOIN users u ON u.id = a.user_id
           LEFT JOIN events e ON e.id = a.event_id
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT 60`
      )
      .all() as Array<Record<string, unknown>>;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      activity: rows.map((row) => ({
        ...row,
        metadata: safeParse(String(row.metadata ?? '{}')),
      })),
    });
  })
);

/** GET /api/admin/settings - system information for the Super Admin. */
adminRouter.get(
  '/settings',
  requireSuperAdmin,
  asyncRoute((_req, res) => {
    const db = getDb();
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM events WHERE deleted_at IS NULL) AS events,
           (SELECT COUNT(*) FROM events WHERE deleted_at IS NOT NULL) AS archived_events,
           (SELECT COUNT(*) FROM responsibilities) AS responsibilities,
           (SELECT COUNT(*) FROM attachments) AS attachments,
           (SELECT COUNT(*) FROM organizations WHERE active = 1) AS organizations,
           (SELECT COUNT(*) FROM venues WHERE active = 1) AS venues`
      )
      .get() as Record<string, number>;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      counts,
      limits: {
        max_staff_admins: MAX_STAFF_ADMINS,
        max_upload_bytes: config.uploads.maxBytes,
        max_files_per_event: config.uploads.maxPerEvent,
      },
    });
  })
);

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export { badRequest };
