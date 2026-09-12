import { Router } from 'express';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { badRequest, conflict, notFound } from '../lib/errors';
import { serializeOrganization } from '../lib/serialize';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  ORGANIZATION_TYPES,
  REPEAT_RULES,
  RESPONSIBILITY_STATUSES,
  type OrganizationRow,
  type VenueRow,
} from '../lib/types';
import { organizationSchema, parseBody, venueSchema } from '../lib/validate';
import { assertAdmin, requireSuperAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const metaRouter = Router();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'organization'
  );
}

function uniqueSlug(base: string, excludeId?: number): string {
  const db = getDb();
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = db
      .prepare('SELECT id FROM organizations WHERE slug = ? AND (? IS NULL OR id <> ?)')
      .get(candidate, excludeId ?? null, excludeId ?? null) as { id: number } | undefined;
    if (!existing) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

/**
 * GET /api/meta - everything the filters and the create form need.
 * Public and cacheable: it contains no operational data.
 */
metaRouter.get(
  '/',
  asyncRoute((req, res) => {
    const db = getDb();
    const includeInactive = Boolean(req.viewer);

    const organizations = db
      .prepare(
        `SELECT * FROM organizations ${includeInactive ? '' : 'WHERE active = 1'}
          ORDER BY sort_order ASC, name ASC`
      )
      .all() as OrganizationRow[];

    const venues = db
      .prepare(
        `SELECT * FROM venues ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY name ASC`
      )
      .all() as VenueRow[];

    // Distinct locations actually in use, so custom venues stay suggestable.
    const usedLocations = (
      db
        .prepare(
          `SELECT DISTINCT location FROM events
            WHERE deleted_at IS NULL AND location <> ''
            ORDER BY location ASC LIMIT 60`
        )
        .all() as Array<{ location: string }>
    ).map((row) => row.location);

    res.setHeader(
      'Cache-Control',
      req.viewer ? 'no-store' : 'public, max-age=300, stale-while-revalidate=600'
    );
    res.json({
      organizations: organizations.map(serializeOrganization),
      venues: venues.map((row) => ({ id: row.id, name: row.name, active: row.active === 1 })),
      locations: usedLocations,
      taxonomy: {
        event_types: EVENT_TYPES,
        event_statuses: EVENT_STATUSES,
        organization_types: ORGANIZATION_TYPES,
        responsibility_statuses: RESPONSIBILITY_STATUSES,
        repeat_rules: REPEAT_RULES,
      },
    });
  })
);

/** Teams that can own a responsibility: every active organisation plus
 *  the teams already used, so "Maintenance Team" does not need a record. */
metaRouter.get(
  '/assignees',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const db = getDb();

    const organizations = (
      db
        .prepare('SELECT name FROM organizations WHERE active = 1 ORDER BY sort_order, name')
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    const usedTeams = (
      db
        .prepare(
          `SELECT DISTINCT assigned_team FROM responsibilities
            WHERE assigned_team <> '' ORDER BY assigned_team LIMIT 80`
        )
        .all() as Array<{ assigned_team: string }>
    ).map((row) => row.assigned_team);

    const admins = db
      .prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY role DESC, name')
      .all() as Array<{ id: number; name: string; role: string }>;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      teams: [...new Set([...organizations, ...usedTeams])].sort((a, b) => a.localeCompare(b)),
      admins: admins.map((admin) => ({
        id: admin.id,
        name: admin.name,
        role: admin.role,
        is_you: admin.id === viewer.id,
      })),
    });
  })
);

// --- organisation management (Super Admin only, spec 2) --------------------

metaRouter.post(
  '/organizations',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const input = parseBody(organizationSchema, req.body);

    const db = getDb();
    const duplicate = db
      .prepare('SELECT id FROM organizations WHERE name = ? COLLATE NOCASE')
      .get(input.name) as { id: number } | undefined;
    if (duplicate) throw conflict(`"${input.name}" is already on the list.`);

    const result = db
      .prepare(
        'INSERT INTO organizations (name, slug, type, active, sort_order) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        input.name,
        uniqueSlug(slugify(input.name)),
        input.type,
        input.active ? 1 : 0,
        input.sort_order
      );

    logActivity('organization.created', { viewer, metadata: { name: input.name, type: input.type } });
    const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(Number(result.lastInsertRowid)) as OrganizationRow;
    res.status(201).json({ organization: serializeOrganization(row) });
  })
);

metaRouter.patch(
  '/organizations/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That organisation no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as
      | OrganizationRow
      | undefined;
    if (!existing) throw notFound('That organisation no longer exists.');

    const input = parseBody(organizationSchema.partial(), req.body);
    const name = input.name ?? existing.name;

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = db
        .prepare('SELECT id FROM organizations WHERE name = ? COLLATE NOCASE AND id <> ?')
        .get(input.name, id) as { id: number } | undefined;
      if (duplicate) throw conflict(`"${input.name}" is already on the list.`);
    }

    db.prepare(
      `UPDATE organizations SET name = ?, slug = ?, type = ?, active = ?, sort_order = ? WHERE id = ?`
    ).run(
      name,
      input.name ? uniqueSlug(slugify(name), id) : existing.slug,
      input.type ?? existing.type,
      (input.active === undefined ? existing.active === 1 : input.active) ? 1 : 0,
      input.sort_order ?? existing.sort_order,
      id
    );

    // Events keep a denormalised organiser name for fast lists - keep it true.
    if (input.name) {
      db.prepare('UPDATE events SET organizer_name = ? WHERE organizer_id = ?').run(name, id);
    }

    logActivity('organization.updated', { viewer, metadata: { name } });
    const row = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as OrganizationRow;
    res.json({ organization: serializeOrganization(row) });
  })
);

metaRouter.delete(
  '/organizations/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That organisation no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM organizations WHERE id = ?').get(id) as
      | OrganizationRow
      | undefined;
    if (!existing) throw notFound('That organisation no longer exists.');

    const inUse = (
      db.prepare('SELECT COUNT(*) AS count FROM events WHERE organizer_id = ?').get(id) as {
        count: number;
      }
    ).count;

    if (inUse > 0) {
      // Deactivate instead of deleting so historical events keep their organiser.
      db.prepare('UPDATE organizations SET active = 0 WHERE id = ?').run(id);
      logActivity('organization.deactivated', { viewer, metadata: { name: existing.name, events: inUse } });
      res.json({ ok: true, deactivated: true, events: inUse });
      return;
    }

    db.prepare('DELETE FROM organizations WHERE id = ?').run(id);
    logActivity('organization.removed', { viewer, metadata: { name: existing.name } });
    res.json({ ok: true, deactivated: false });
  })
);

// --- venue management (Super Admin only) ----------------------------------

metaRouter.post(
  '/venues',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const input = parseBody(venueSchema, req.body);

    const db = getDb();
    const duplicate = db.prepare('SELECT id FROM venues WHERE name = ? COLLATE NOCASE').get(input.name) as
      | { id: number }
      | undefined;
    if (duplicate) throw conflict(`"${input.name}" is already on the venue list.`);

    const result = db
      .prepare('INSERT INTO venues (name, active) VALUES (?, ?)')
      .run(input.name, input.active ? 1 : 0);
    logActivity('venue.created', { viewer, metadata: { name: input.name } });

    const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(Number(result.lastInsertRowid)) as VenueRow;
    res.status(201).json({ venue: { id: row.id, name: row.name, active: row.active === 1 } });
  })
);

metaRouter.patch(
  '/venues/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That venue no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as VenueRow | undefined;
    if (!existing) throw notFound('That venue no longer exists.');

    const input = parseBody(venueSchema.partial(), req.body);
    if (input.name === undefined && input.active === undefined) {
      throw badRequest('There was nothing to update.');
    }

    db.prepare('UPDATE venues SET name = ?, active = ? WHERE id = ?').run(
      input.name ?? existing.name,
      (input.active === undefined ? existing.active === 1 : input.active) ? 1 : 0,
      id
    );
    logActivity('venue.updated', { viewer, metadata: { name: input.name ?? existing.name } });

    const row = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as VenueRow;
    res.json({ venue: { id: row.id, name: row.name, active: row.active === 1 } });
  })
);

metaRouter.delete(
  '/venues/:id',
  requireSuperAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That venue no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as VenueRow | undefined;
    if (!existing) throw notFound('That venue no longer exists.');

    db.prepare('DELETE FROM venues WHERE id = ?').run(id);
    logActivity('venue.removed', { viewer, metadata: { name: existing.name } });
    res.json({ ok: true });
  })
);
