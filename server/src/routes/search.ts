import { Router } from 'express';
import { getDb } from '../db';
import { EVENT_ORDER_BY } from '../lib/eventPresenter';
import { presentEvents } from '../lib/eventPresenter';
import { serializeQuickNote } from '../lib/serialize';
import type { EventRow, QuickNoteRow, Viewer } from '../lib/types';
import { asyncRoute } from '../middleware/error';

export const searchRouter = Router();

const MAX_RESULTS = 20;

/**
 * GET /api/search?q=... - one global search (spec 19).
 *
 * Public visitors search public events, their locations, organisers and the
 * responsibilities marked public. Administrators additionally search their own
 * Quick Notes and every responsibility.
 */
searchRouter.get(
  '/',
  asyncRoute((req, res) => {
    const viewer: Viewer | null = req.viewer;
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    res.setHeader('Cache-Control', 'no-store');

    if (raw.length < 2) {
      res.json({ query: raw, events: [], responsibilities: [], notes: [], organizations: [] });
      return;
    }

    const term = raw.slice(0, 120);
    const like = `%${term}%`;
    const db = getDb();

    const eventRows = db
      .prepare(
        `SELECT e.* FROM events e
           LEFT JOIN organizations o ON o.id = e.organizer_id
          WHERE e.deleted_at IS NULL
            ${viewer ? '' : 'AND e.is_public = 1'}
            AND (e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ?
                 OR e.organizer_name LIKE ? OR o.name LIKE ?)
          ORDER BY ${EVENT_ORDER_BY}
          LIMIT ?`
      )
      .all(like, like, like, like, like, MAX_RESULTS) as EventRow[];

    const responsibilityRows = db
      .prepare(
        `SELECT r.id, r.title, r.assigned_team, r.note, r.status, r.due_at,
                e.id AS event_id, e.title AS event_title, e.event_date
           FROM responsibilities r
           JOIN events e ON e.id = r.event_id
          WHERE e.deleted_at IS NULL
            ${viewer ? '' : 'AND e.is_public = 1 AND r.public_visibility = 1'}
            AND (r.title LIKE ? OR r.note LIKE ? OR r.assigned_team LIKE ?)
          ORDER BY e.event_date DESC, r.position ASC
          LIMIT ?`
      )
      .all(like, like, like, MAX_RESULTS) as Array<Record<string, unknown>>;

    const organizationRows = db
      .prepare(
        `SELECT id, name, type FROM organizations
          WHERE active = 1 AND name LIKE ?
          ORDER BY sort_order, name LIMIT 10`
      )
      .all(like) as Array<{ id: number; name: string; type: string }>;

    // Private notes are only ever searched within the requester's own rows.
    const noteRows = viewer
      ? (db
          .prepare(
            `SELECT * FROM quick_notes
              WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
              ORDER BY pinned DESC, updated_at DESC LIMIT ?`
          )
          .all(viewer.id, like, like, MAX_RESULTS) as QuickNoteRow[])
      : [];

    res.json({
      query: term,
      events: presentEvents(eventRows, viewer),
      responsibilities: responsibilityRows,
      organizations: organizationRows,
      notes: noteRows.map(serializeQuickNote),
    });
  })
);
