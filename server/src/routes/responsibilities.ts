import { Router } from 'express';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { conflict, notFound } from '../lib/errors';
import { findTeamConflicts } from '../lib/events';
import { serializeResponsibility } from '../lib/serialize';
import { to12Hour } from '../lib/events';
import type { EventRow, ResponsibilityRow, Viewer } from '../lib/types';
import {
  parseBody,
  responsibilityCreateSchema,
  responsibilityUpdateSchema,
} from '../lib/validate';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const responsibilitiesRouter = Router();

function loadResponsibility(id: number): ResponsibilityRow {
  const row = getDb().prepare('SELECT * FROM responsibilities WHERE id = ?').get(id) as
    | ResponsibilityRow
    | undefined;
  if (!row) throw notFound('That responsibility no longer exists.');
  return row;
}

function loadLiveEvent(id: number): EventRow {
  const row = getDb()
    .prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL')
    .get(id) as EventRow | undefined;
  if (!row) throw notFound('That event no longer exists.');
  return row;
}

function present(row: ResponsibilityRow, viewer: Viewer) {
  const db = getDb();
  const names = new Map<number, string>();
  for (const id of [row.assigned_user_id, row.completed_by]) {
    if (id && !names.has(id)) {
      const user = db.prepare('SELECT name FROM users WHERE id = ?').get(id) as
        | { name: string }
        | undefined;
      if (user) names.set(id, user.name);
    }
  }
  return serializeResponsibility(row, viewer, {
    assigneeName: row.assigned_user_id ? names.get(row.assigned_user_id) ?? null : null,
    completedByName: row.completed_by ? names.get(row.completed_by) ?? null : null,
  });
}

/** POST /api/events/:eventId/responsibilities */
responsibilitiesRouter.post(
  '/events/:eventId/responsibilities',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) throw notFound('That event no longer exists.');

    const event = loadLiveEvent(eventId);
    const input = parseBody(responsibilityCreateSchema, req.body);

    // Warn when the same team is already busy at this time (spec 24).
    if (!input.override_conflicts && input.assigned_team.trim()) {
      const conflicts = findTeamConflicts({ team: input.assigned_team, eventId });
      if (conflicts.length > 0) {
        const first = conflicts[0];
        const when = first.start_time ? ` at ${to12Hour(first.start_time)}` : '';
        throw conflict(
          `${first.team} is already assigned to "${first.responsibility_title}" for "${first.event_title}"${when}.`,
          { conflicts, can_override: true }
        );
      }
    }

    const db = getDb();
    const nextPosition =
      ((
        db.prepare('SELECT MAX(position) AS max FROM responsibilities WHERE event_id = ?').get(eventId) as
          | { max: number | null }
          | undefined
      )?.max ?? -1) + 1;

    const completedNow = input.status === 'completed';
    const result = db
      .prepare(
        `INSERT INTO responsibilities (event_id, title, assigned_user_id, assigned_team, note,
                                       due_at, status, public_visibility, position,
                                       completed_by, completed_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        input.title,
        input.assigned_user_id ?? null,
        input.assigned_team,
        input.note,
        input.due_at,
        input.status,
        input.public_visibility ? 1 : 0,
        nextPosition,
        completedNow ? viewer.id : null,
        completedNow ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
        viewer.id
      );

    const row = loadResponsibility(Number(result.lastInsertRowid));
    logActivity('responsibility.created', {
      eventId,
      viewer,
      metadata: { title: row.title, assigned_to: row.assigned_team || null, event_title: event.title },
    });

    res.status(201).json({ responsibility: present(row, viewer) });
  })
);

/** PATCH /api/responsibilities/:id */
responsibilitiesRouter.patch(
  '/responsibilities/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That responsibility no longer exists.');

    const existing = loadResponsibility(id);
    const input = parseBody(responsibilityUpdateSchema, req.body);

    const next = {
      title: input.title ?? existing.title,
      assigned_user_id:
        'assigned_user_id' in (req.body ?? {})
          ? input.assigned_user_id ?? null
          : existing.assigned_user_id,
      assigned_team: input.assigned_team ?? existing.assigned_team,
      note: input.note ?? existing.note,
      due_at: 'due_at' in (req.body ?? {}) ? input.due_at ?? null : existing.due_at,
      status: input.status ?? existing.status,
      public_visibility:
        input.public_visibility === undefined
          ? existing.public_visibility === 1
          : input.public_visibility,
    };

    const becameComplete = next.status === 'completed' && existing.status !== 'completed';
    const becameIncomplete = next.status !== 'completed' && existing.status === 'completed';

    getDb()
      .prepare(
        `UPDATE responsibilities
            SET title = @title, assigned_user_id = @assigned_user_id, assigned_team = @assigned_team,
                note = @note, due_at = @due_at, status = @status,
                public_visibility = @public_visibility,
                completed_by = @completed_by, completed_at = @completed_at,
                updated_at = datetime('now')
          WHERE id = @id`
      )
      .run({
        ...next,
        public_visibility: next.public_visibility ? 1 : 0,
        completed_by: becameComplete ? viewer.id : becameIncomplete ? null : existing.completed_by,
        completed_at: becameComplete
          ? new Date().toISOString().replace('T', ' ').slice(0, 19)
          : becameIncomplete
            ? null
            : existing.completed_at,
        id,
      });

    const row = loadResponsibility(id);

    if (becameComplete) {
      logActivity('responsibility.completed', {
        eventId: row.event_id,
        viewer,
        metadata: { title: row.title, assigned_to: row.assigned_team || null },
      });
    } else if (becameIncomplete) {
      logActivity('responsibility.reopened', {
        eventId: row.event_id,
        viewer,
        metadata: { title: row.title },
      });
    } else {
      logActivity('responsibility.updated', {
        eventId: row.event_id,
        viewer,
        metadata: { title: row.title },
      });
    }

    res.json({ responsibility: present(row, viewer) });
  })
);

/** DELETE /api/responsibilities/:id */
responsibilitiesRouter.delete(
  '/responsibilities/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That responsibility no longer exists.');

    const existing = loadResponsibility(id);
    getDb().prepare('DELETE FROM responsibilities WHERE id = ?').run(id);
    logActivity('responsibility.removed', {
      eventId: existing.event_id,
      viewer,
      metadata: { title: existing.title },
    });

    res.json({ ok: true });
  })
);

/**
 * GET /api/tasks/mine - the My Tasks page (spec 26).
 *
 * "Mine" means assigned to this admin account itself. Work owned by a team is
 * tracked on the event's checklist and in Event Readiness, which keeps this
 * page a short personal list rather than a copy of every task in the system.
 */
responsibilitiesRouter.get(
  '/tasks/mine',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const includeCompleted = String((req.query as Record<string, unknown>).include_completed) === 'true';

    const rows = getDb()
      .prepare(
        `SELECT r.*, e.title AS event_title, e.event_date AS event_date,
                e.start_time AS event_start_time, e.status AS event_status
           FROM responsibilities r
           JOIN events e ON e.id = r.event_id
          WHERE e.deleted_at IS NULL
            AND e.status <> 'cancelled'
            AND r.assigned_user_id = ?
            ${includeCompleted ? '' : `AND r.status <> 'completed'`}
          ORDER BY (r.due_at IS NULL), r.due_at ASC, e.event_date ASC, r.position ASC
          LIMIT 200`
      )
      .all(viewer.id) as Array<
      ResponsibilityRow & {
        event_title: string;
        event_date: string;
        event_start_time: string | null;
        event_status: string;
      }
    >;

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      tasks: rows.map((row) => ({
        ...serializeResponsibility(row, viewer),
        event: {
          id: row.event_id,
          title: row.event_title,
          event_date: row.event_date,
          start_time: row.event_start_time,
          status: row.event_status,
        },
      })),
    });
  })
);
