import { Router } from 'express';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { notFound } from '../lib/errors';
import { findTeamConflicts } from '../lib/events';
import { serializeQuickNote, serializeResponsibility } from '../lib/serialize';
import type { EventRow, QuickNoteRow, ResponsibilityRow, Viewer } from '../lib/types';
import {
  parseBody,
  quickNoteConvertSchema,
  quickNoteCreateSchema,
  quickNoteUpdateSchema,
} from '../lib/validate';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const quickNotesRouter = Router();

// Every statement in this file is scoped by user_id. Quick Notes are private to
// their author and the super admin is no exception (spec 14).
quickNotesRouter.use(requireAdmin);

function loadOwnNote(id: number, viewer: Viewer): QuickNoteRow {
  const row = getDb()
    .prepare('SELECT * FROM quick_notes WHERE id = ? AND user_id = ?')
    .get(id, viewer.id) as QuickNoteRow | undefined;
  // A note belonging to another admin is reported as missing, not forbidden,
  // so the API never confirms that someone else's note exists.
  if (!row) throw notFound('That note no longer exists.');
  return row;
}

quickNotesRouter.get(
  '/',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const query = req.query as Record<string, unknown>;
    const search = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
    const archived = String(query.archived) === 'true';

    const params: unknown[] = [viewer.id, archived ? 1 : 0];
    let clause = 'WHERE user_id = ? AND archived = ?';
    if (search) {
      clause += ' AND (title LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const rows = getDb()
      .prepare(
        `SELECT * FROM quick_notes ${clause}
          ORDER BY pinned DESC, updated_at DESC, id DESC
          LIMIT 300`
      )
      .all(...params) as QuickNoteRow[];

    res.setHeader('Cache-Control', 'no-store');
    res.json({ notes: rows.map(serializeQuickNote) });
  })
);

quickNotesRouter.post(
  '/',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const input = parseBody(quickNoteCreateSchema, req.body);

    // Saving must be instant and never blocked by a missing field (spec 13):
    // a note with only a body is perfectly valid, and gets a title derived
    // from its first line.
    const title = input.title || deriveTitle(input.content);

    const result = getDb()
      .prepare('INSERT INTO quick_notes (user_id, title, content, pinned) VALUES (?, ?, ?, ?)')
      .run(viewer.id, title, input.content, input.pinned ? 1 : 0);

    const row = loadOwnNote(Number(result.lastInsertRowid), viewer);
    res.status(201).json({ note: serializeQuickNote(row) });
  })
);

quickNotesRouter.patch(
  '/:id',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That note no longer exists.');

    const existing = loadOwnNote(id, viewer);
    const input = parseBody(quickNoteUpdateSchema, req.body);

    const content = input.content ?? existing.content;
    const title =
      input.title !== undefined
        ? input.title || deriveTitle(content)
        : existing.title || deriveTitle(content);

    getDb()
      .prepare(
        `UPDATE quick_notes
            SET title = ?, content = ?, pinned = ?, archived = ?, updated_at = datetime('now')
          WHERE id = ? AND user_id = ?`
      )
      .run(
        title,
        content,
        (input.pinned === undefined ? existing.pinned === 1 : input.pinned) ? 1 : 0,
        (input.archived === undefined ? existing.archived === 1 : input.archived) ? 1 : 0,
        id,
        viewer.id
      );

    res.json({ note: serializeQuickNote(loadOwnNote(id, viewer)) });
  })
);

quickNotesRouter.delete(
  '/:id',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That note no longer exists.');

    loadOwnNote(id, viewer);
    getDb().prepare('DELETE FROM quick_notes WHERE id = ? AND user_id = ?').run(id, viewer.id);
    res.json({ ok: true });
  })
);

/** POST /api/notes/:id/convert - turns a thought into a responsibility (spec 16). */
quickNotesRouter.post(
  '/:id/convert',
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That note no longer exists.');

    const note = loadOwnNote(id, viewer);
    const input = parseBody(quickNoteConvertSchema, req.body);

    const db = getDb();
    const event = db
      .prepare('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL')
      .get(input.event_id) as EventRow | undefined;
    if (!event) throw notFound('That event no longer exists.');

    const conflicts = input.assigned_team.trim()
      ? findTeamConflicts({ team: input.assigned_team, eventId: input.event_id })
      : [];

    const nextPosition =
      ((
        db
          .prepare('SELECT MAX(position) AS max FROM responsibilities WHERE event_id = ?')
          .get(input.event_id) as { max: number | null } | undefined
      )?.max ?? -1) + 1;

    const convert = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO responsibilities (event_id, title, assigned_user_id, assigned_team, note,
                                         due_at, public_visibility, position, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.event_id,
          input.title,
          input.assigned_user_id ?? null,
          input.assigned_team,
          input.note || note.content,
          input.due_at,
          input.public_visibility ? 1 : 0,
          nextPosition,
          viewer.id
        );

      if (input.archive_note) {
        db.prepare(
          `UPDATE quick_notes SET archived = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
        ).run(id, viewer.id);
      }
      return Number(result.lastInsertRowid);
    });

    const responsibilityId = convert();
    const row = db.prepare('SELECT * FROM responsibilities WHERE id = ?').get(responsibilityId) as
      | ResponsibilityRow
      | undefined;
    if (!row) throw notFound('We could not create that task. Please try again.');

    logActivity('responsibility.created_from_note', {
      eventId: input.event_id,
      viewer,
      metadata: { title: row.title, assigned_to: row.assigned_team || null },
    });

    res.status(201).json({
      responsibility: serializeResponsibility(row, viewer),
      // The warning is informational here: the admin already chose the event.
      conflicts,
      note: serializeQuickNote(loadOwnNote(id, viewer)),
    });
  })
);

function deriveTitle(content: string): string {
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  if (!firstLine) return 'Untitled note';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}
