import { Router } from 'express';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { forbidden, notFound } from '../lib/errors';
import type { EventRow } from '../lib/types';
import { eventNoteSchema, parseBody } from '../lib/validate';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const eventNotesRouter = Router();

// Event notes are shared operational context for administrators - distinct
// from private Quick Notes (spec 17). Public viewers never see them.
//
// The guard is attached per route rather than with a blanket `router.use`:
// this router is mounted on the shared `/api` prefix, so a path-less
// middleware here would reject unauthenticated requests destined for the
// routers mounted after it - such as a public attachment download.

interface EventNoteRow {
  id: number;
  event_id: number;
  created_by: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}

function loadEvent(eventId: number): EventRow {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(eventId) as
    | EventRow
    | undefined;
  if (!row) throw notFound('That event no longer exists.');
  return row;
}

eventNotesRouter.post(
  '/events/:eventId/notes',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) throw notFound('That event no longer exists.');

    loadEvent(eventId);
    const { content } = parseBody(eventNoteSchema, req.body);

    const result = getDb()
      .prepare('INSERT INTO event_notes (event_id, created_by, content) VALUES (?, ?, ?)')
      .run(eventId, viewer.id, content);

    logActivity('event_note.added', { eventId, viewer, metadata: {} });

    const row = getDb()
      .prepare(
        `SELECT n.id, n.event_id, n.content, n.created_at, n.updated_at, n.created_by,
                u.name AS author_name
           FROM event_notes n LEFT JOIN users u ON u.id = n.created_by
          WHERE n.id = ?`
      )
      .get(Number(result.lastInsertRowid));

    res.status(201).json({ note: row });
  })
);

eventNotesRouter.patch(
  '/event-notes/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That note no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM event_notes WHERE id = ?').get(id) as
      | EventNoteRow
      | undefined;
    if (!existing) throw notFound('That note no longer exists.');

    // Authors edit their own notes; the super admin can correct any of them.
    if (existing.created_by !== viewer.id && viewer.role !== 'super_admin') {
      throw forbidden('Only the admin who wrote this note can edit it.');
    }

    const { content } = parseBody(eventNoteSchema, req.body);
    db.prepare(`UPDATE event_notes SET content = ?, updated_at = datetime('now') WHERE id = ?`).run(
      content,
      id
    );
    logActivity('event_note.updated', { eventId: existing.event_id, viewer, metadata: {} });

    const row = db
      .prepare(
        `SELECT n.id, n.event_id, n.content, n.created_at, n.updated_at, n.created_by,
                u.name AS author_name
           FROM event_notes n LEFT JOIN users u ON u.id = n.created_by
          WHERE n.id = ?`
      )
      .get(id);
    res.json({ note: row });
  })
);

eventNotesRouter.delete(
  '/event-notes/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That note no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM event_notes WHERE id = ?').get(id) as
      | EventNoteRow
      | undefined;
    if (!existing) throw notFound('That note no longer exists.');
    if (existing.created_by !== viewer.id && viewer.role !== 'super_admin') {
      throw forbidden('Only the admin who wrote this note can remove it.');
    }

    db.prepare('DELETE FROM event_notes WHERE id = ?').run(id);
    logActivity('event_note.removed', { eventId: existing.event_id, viewer, metadata: {} });
    res.json({ ok: true });
  })
);
