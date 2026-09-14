import { Router } from 'express';
import { getDb } from '../db';
import { listEventActivity, logActivity } from '../lib/activity';
import { conflict, badRequest, notFound } from '../lib/errors';
import { expandRepeat, isValidDate, todayISO } from '../lib/dates';
import {
  describeVenueConflict,
  findVenueConflicts,
  loadOrganizationMap,
} from '../lib/events';
import {
  EVENT_BASE_SELECT,
  EVENT_ORDER_BY,
  buildEventWhere,
  presentEvent,
  presentEvents,
  type EventFilters,
} from '../lib/eventPresenter';
import {
  serializeAttachment,
  serializeResponsibility,
} from '../lib/serialize';
import {
  EVENT_STATUSES,
  EVENT_TYPES,
  ORGANIZATION_TYPES,
  type AttachmentRow,
  type EventRow,
  type ResponsibilityRow,
  type Viewer,
} from '../lib/types';
import { eventCreateSchema, eventUpdateSchema, parseBody } from '../lib/validate';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const eventsRouter = Router();

const MAX_PAGE_SIZE = 200;

function readFilters(query: Record<string, unknown>, viewer: Viewer | null): EventFilters {
  const str = (key: string): string | undefined => {
    const value = query[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const from = str('from');
  const to = str('to');
  const eventType = str('event_type');
  const status = str('status');
  const source = str('source');
  const organizerId = Number(str('organizer_id'));

  const filters: EventFilters = {
    q: str('q')?.slice(0, 120),
    important: str('important') === 'true',
    deadlinesOnly: str('deadlines') === 'true',
    includeArchived: Boolean(viewer) && str('include_archived') === 'true',
  };

  if (from && isValidDate(from)) filters.from = from;
  if (to && isValidDate(to)) filters.to = to;
  if (eventType && (EVENT_TYPES as string[]).includes(eventType)) filters.eventType = eventType;
  if (status && (EVENT_STATUSES as string[]).includes(status)) filters.status = status;
  if (source && (ORGANIZATION_TYPES as string[]).includes(source)) filters.source = source;
  if (Number.isInteger(organizerId) && organizerId > 0) filters.organizerId = organizerId;

  return filters;
}

function getEventRow(id: number, viewer: Viewer | null): EventRow {
  const db = getDb();
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;

  if (!row) throw notFound('That event no longer exists.');
  // Public visitors must not be able to probe private or archived events.
  if (!viewer && (row.is_public !== 1 || row.deleted_at !== null)) {
    throw notFound('That event no longer exists.');
  }
  return row;
}

/** GET /api/events - calendar, event list and filters all use this one route. */
eventsRouter.get(
  '/',
  asyncRoute((req, res) => {
    const viewer = req.viewer;
    const filters = readFilters(req.query as Record<string, unknown>, viewer);

    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(String((req.query as Record<string, unknown>).limit ?? '100'), 10) || 100)
    );
    const offset = Math.max(
      0,
      Number.parseInt(String((req.query as Record<string, unknown>).offset ?? '0'), 10) || 0
    );

    const { clause, params } = buildEventWhere(filters, viewer);
    const db = getDb();

    const rows = db
      .prepare(`${EVENT_BASE_SELECT} ${clause} ORDER BY ${EVENT_ORDER_BY} LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as EventRow[];

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM events e LEFT JOIN organizations o ON o.id = e.organizer_id ${clause}`
        )
        .get(...params) as { count: number }
    ).count;

    if (!viewer) {
      // Public calendar data is safe to cache briefly (spec 36).
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    res.json({
      events: presentEvents(rows, viewer),
      page: { total, limit, offset, has_more: offset + rows.length < total },
    });
  })
);

/** GET /api/events/:id - full detail panel. */
eventsRouter.get(
  '/:id',
  asyncRoute((req, res) => {
    const viewer = req.viewer;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That event no longer exists.');

    const row = getEventRow(id, viewer);
    const db = getDb();

    const responsibilityRows = db
      .prepare(
        `SELECT * FROM responsibilities
          WHERE event_id = ? ${viewer ? '' : 'AND public_visibility = 1'}
          ORDER BY position ASC, id ASC`
      )
      .all(id) as ResponsibilityRow[];

    const userNames = loadUserNames(
      responsibilityRows.flatMap((r) => [r.assigned_user_id, r.completed_by])
    );

    const responsibilities = responsibilityRows.map((r) =>
      serializeResponsibility(r, viewer, {
        assigneeName: r.assigned_user_id ? userNames.get(r.assigned_user_id) ?? null : null,
        completedByName: r.completed_by ? userNames.get(r.completed_by) ?? null : null,
      })
    );

    const attachmentRows = db
      .prepare(
        `SELECT * FROM attachments
          WHERE event_id = ? ${viewer ? '' : 'AND public_visibility = 1'}
          ORDER BY created_at DESC, id DESC`
      )
      .all(id) as AttachmentRow[];

    const uploaderNames = loadUserNames(attachmentRows.map((a) => a.uploaded_by));
    const attachments = attachmentRows.map((a) =>
      serializeAttachment(a, a.uploaded_by ? uploaderNames.get(a.uploaded_by) ?? null : null)
    );

    const payload: Record<string, unknown> = {
      event: presentEvent(row, viewer),
      responsibilities,
      attachments,
    };

    if (viewer) {
      // Internal material: notes and the accountability trail (spec 25, 29).
      const noteRows = db
        .prepare(
          `SELECT n.id, n.content, n.created_at, n.updated_at, n.created_by, u.name AS author_name
             FROM event_notes n
             LEFT JOIN users u ON u.id = n.created_by
            WHERE n.event_id = ?
            ORDER BY n.created_at DESC, n.id DESC`
        )
        .all(id) as Array<Record<string, unknown>>;
      payload.notes = noteRows;
      payload.activity = listEventActivity(id);
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    }

    res.json(payload);
  })
);

/** POST /api/events - create, optionally materialising a repeat series. */
eventsRouter.post(
  '/',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const input = parseBody(eventCreateSchema, req.body);

    const resolved = resolveOrganizer(input.organizer_id ?? null, input.organizer_name);
    const allDay = input.all_day;
    const startTime = allDay ? null : normalizeOptionalTime(input.start_time);
    const endTime = allDay ? null : normalizeOptionalTime(input.end_time);
    const repeatUntil = input.repeat_until && input.repeat_until !== '' ? input.repeat_until : null;

    const dates = expandRepeat({
      startDate: input.event_date,
      rule: input.repeat_rule as 'none' | 'daily' | 'weekly' | 'monthly' | 'custom',
      interval: input.repeat_interval,
      until: repeatUntil,
    });

    // Conflicts are checked for the first occurrence and reported as a warning
    // the admin can accept (spec 23) - never as a hard block.
    if (!input.override_conflicts && input.location.trim()) {
      const conflicts = findVenueConflicts({
        location: input.location,
        event_date: input.event_date,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
      });
      if (conflicts.length > 0) {
        throw conflict(describeVenueConflict(conflicts[0]), {
          conflicts,
          can_override: true,
        });
      }
    }

    const db = getDb();
    const insert = db.prepare(
      `INSERT INTO events (title, description, event_type, organizer_id, organizer_name,
                           event_date, start_time, end_time, all_day, location, status,
                           important, is_public, repeat_rule, repeat_interval, repeat_until,
                           parent_event_id, created_by)
       VALUES (@title, @description, @event_type, @organizer_id, @organizer_name,
               @event_date, @start_time, @end_time, @all_day, @location, @status,
               @important, @is_public, @repeat_rule, @repeat_interval, @repeat_until,
               @parent_event_id, @created_by)`
    );

    const createSeries = db.transaction(() => {
      let firstId: number | null = null;
      dates.forEach((date, index) => {
        const result = insert.run({
          title: input.title,
          description: input.description,
          event_type: input.event_type,
          organizer_id: resolved.id,
          organizer_name: resolved.name,
          event_date: date,
          start_time: startTime,
          end_time: endTime,
          all_day: allDay ? 1 : 0,
          location: input.location,
          status: input.status,
          important: input.important ? 1 : 0,
          is_public: input.is_public ? 1 : 0,
          repeat_rule: index === 0 ? input.repeat_rule : 'none',
          repeat_interval: input.repeat_interval,
          repeat_until: index === 0 ? repeatUntil : null,
          parent_event_id: firstId,
          created_by: viewer.id,
        });
        if (index === 0) firstId = Number(result.lastInsertRowid);
      });
      return firstId as number | null;
    });

    const createdId = createSeries();
    if (createdId === null) throw badRequest('We could not create that event. Please try again.');

    logActivity('event.created', {
      eventId: createdId,
      viewer,
      metadata: { title: input.title, occurrences: dates.length },
    });

    const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(createdId) as EventRow;
    res.status(201).json({
      event: presentEvent(row, viewer),
      occurrences_created: dates.length,
    });
  })
);

/** PATCH /api/events/:id - partial update with an activity trail. */
eventsRouter.patch(
  '/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That event no longer exists.');

    const existing = getEventRow(id, viewer);
    const input = parseBody(eventUpdateSchema, req.body);

    const next = {
      title: input.title ?? existing.title,
      description: input.description ?? existing.description,
      event_type: input.event_type ?? existing.event_type,
      organizer_id: existing.organizer_id,
      organizer_name: existing.organizer_name,
      event_date: input.event_date ?? existing.event_date,
      start_time: existing.start_time,
      end_time: existing.end_time,
      all_day: input.all_day === undefined ? existing.all_day === 1 : input.all_day,
      location: input.location ?? existing.location,
      status: input.status ?? existing.status,
      important: input.important === undefined ? existing.important === 1 : input.important,
      is_public: input.is_public === undefined ? existing.is_public === 1 : input.is_public,
    };

    if ('organizer_id' in req.body || input.organizer_name !== undefined) {
      const resolved = resolveOrganizer(
        input.organizer_id ?? null,
        input.organizer_name ?? existing.organizer_name
      );
      next.organizer_id = resolved.id;
      next.organizer_name = resolved.name;
    }

    if (input.start_time !== undefined) next.start_time = normalizeOptionalTime(input.start_time);
    if (input.end_time !== undefined) next.end_time = normalizeOptionalTime(input.end_time);
    if (next.all_day) {
      next.start_time = null;
      next.end_time = null;
    }

    if (next.start_time && next.end_time && next.end_time <= next.start_time) {
      throw badRequest('The end time must be after the start time.');
    }

    const timingChanged =
      next.event_date !== existing.event_date ||
      next.start_time !== existing.start_time ||
      next.end_time !== existing.end_time ||
      (next.all_day ? 1 : 0) !== existing.all_day ||
      next.location.trim().toLowerCase() !== existing.location.trim().toLowerCase();

    if (!input.override_conflicts && timingChanged && next.location.trim()) {
      const conflicts = findVenueConflicts({
        id,
        location: next.location,
        event_date: next.event_date,
        start_time: next.start_time,
        end_time: next.end_time,
        all_day: next.all_day,
      });
      if (conflicts.length > 0) {
        throw conflict(describeVenueConflict(conflicts[0]), { conflicts, can_override: true });
      }
    }

    getDb()
      .prepare(
        `UPDATE events
            SET title = @title, description = @description, event_type = @event_type,
                organizer_id = @organizer_id, organizer_name = @organizer_name,
                event_date = @event_date, start_time = @start_time, end_time = @end_time,
                all_day = @all_day, location = @location, status = @status,
                important = @important, is_public = @is_public,
                updated_at = datetime('now')
          WHERE id = @id`
      )
      .run({
        ...next,
        all_day: next.all_day ? 1 : 0,
        important: next.important ? 1 : 0,
        is_public: next.is_public ? 1 : 0,
        id,
      });

    for (const entry of describeChanges(existing, next)) {
      logActivity(entry.action, { eventId: id, viewer, metadata: entry.metadata });
    }

    const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow;
    res.json({ event: presentEvent(row, viewer) });
  })
);

/** DELETE /api/events/:id - archives rather than destroys (spec 45). */
eventsRouter.delete(
  '/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That event no longer exists.');

    const existing = getEventRow(id, viewer);
    if (existing.deleted_at !== null) {
      res.json({ ok: true, archived: true });
      return;
    }

    getDb()
      .prepare(`UPDATE events SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    logActivity('event.archived', { eventId: id, viewer, metadata: { title: existing.title } });

    res.json({ ok: true, archived: true });
  })
);

/** POST /api/events/:id/restore - bring an archived event back. */
eventsRouter.post(
  '/:id/restore',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    const existing = getEventRow(id, viewer);

    getDb()
      .prepare(`UPDATE events SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`)
      .run(id);
    logActivity('event.restored', { eventId: id, viewer, metadata: { title: existing.title } });

    const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow;
    res.json({ event: presentEvent(row, viewer) });
  })
);

/** POST /api/events/:id/duplicate - copy an event and its checklist (spec 44). */
eventsRouter.post(
  '/:id/duplicate',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    const source = getEventRow(id, viewer);

    const bodyDate = typeof req.body?.event_date === 'string' ? req.body.event_date.trim() : '';
    const targetDate = bodyDate && isValidDate(bodyDate) ? bodyDate : source.event_date;
    const copyResponsibilities = req.body?.copy_responsibilities !== false;

    const db = getDb();
    const duplicate = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO events (title, description, event_type, organizer_id, organizer_name,
                               event_date, start_time, end_time, all_day, location, status,
                               important, is_public, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?)`
        )
        .run(
          `${source.title} (copy)`,
          source.description,
          source.event_type,
          source.organizer_id,
          source.organizer_name,
          targetDate,
          source.start_time,
          source.end_time,
          source.all_day,
          source.location,
          source.important,
          source.is_public,
          viewer.id
        );
      const newId = Number(result.lastInsertRowid);

      if (copyResponsibilities) {
        // The checklist template carries over; progress does not.
        db.prepare(
          `INSERT INTO responsibilities (event_id, title, assigned_user_id, assigned_team, note,
                                         public_visibility, position, created_by)
           SELECT ?, title, assigned_user_id, assigned_team, note, public_visibility, position, ?
             FROM responsibilities WHERE event_id = ?`
        ).run(newId, viewer.id, id);
      }
      return newId;
    });

    const newId = duplicate();
    logActivity('event.duplicated', {
      eventId: newId,
      viewer,
      metadata: { source_event_id: id, source_title: source.title },
    });

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(newId) as EventRow;
    res.status(201).json({ event: presentEvent(row, viewer) });
  })
);

/** GET /api/events/:id/activity - internal history, admins only. */
eventsRouter.get(
  '/:id/activity',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    getEventRow(id, viewer);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ activity: listEventActivity(id, 100) });
  })
);

/** POST /api/events/check-conflicts - lets the form warn before saving. */
eventsRouter.post(
  '/check-conflicts',
  requireAdmin,
  asyncRoute((req, res) => {
    assertAdmin(req);
    const body = req.body ?? {};
    const date = typeof body.event_date === 'string' ? body.event_date : '';
    const location = typeof body.location === 'string' ? body.location : '';
    if (!isValidDate(date) || !location.trim()) {
      res.json({ conflicts: [] });
      return;
    }

    const conflicts = findVenueConflicts({
      id: Number.isInteger(Number(body.id)) && Number(body.id) > 0 ? Number(body.id) : null,
      location,
      event_date: date,
      start_time: typeof body.start_time === 'string' && body.start_time ? body.start_time : null,
      end_time: typeof body.end_time === 'string' && body.end_time ? body.end_time : null,
      all_day: Boolean(body.all_day),
    });
    res.json({ conflicts });
  })
);

// --- helpers ---------------------------------------------------------------

function normalizeOptionalTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveOrganizer(
  organizerId: number | null,
  organizerName: string
): { id: number | null; name: string } {
  const fallbackName = organizerName.trim() || 'MRTC';
  if (!organizerId) return { id: null, name: fallbackName };

  const organizations = loadOrganizationMap();
  const found = organizations.get(organizerId);
  if (!found) throw badRequest('That organiser is not on the list. Please pick another.');
  return { id: found.id, name: found.name };
}

function loadUserNames(ids: Array<number | null>): Map<number, string> {
  const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
  if (unique.length === 0) return new Map();
  const placeholders = unique.map(() => '?').join(',');
  const rows = getDb()
    .prepare(`SELECT id, name FROM users WHERE id IN (${placeholders})`)
    .all(...unique) as Array<{ id: number; name: string }>;
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Produces the human readable activity entries shown in event history. */
function describeChanges(
  before: EventRow,
  after: {
    title: string;
    event_date: string;
    location: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    important: boolean;
    is_public: boolean;
  }
): Array<{ action: string; metadata: Record<string, unknown> }> {
  const entries: Array<{ action: string; metadata: Record<string, unknown> }> = [];

  if (before.title !== after.title) {
    entries.push({ action: 'event.renamed', metadata: { from: before.title, to: after.title } });
  }
  if (before.location !== after.location) {
    entries.push({
      action: 'event.location_changed',
      metadata: { from: before.location, to: after.location },
    });
  }
  if (before.event_date !== after.event_date) {
    entries.push({
      action: 'event.date_changed',
      metadata: { from: before.event_date, to: after.event_date },
    });
  }
  if (before.start_time !== after.start_time || before.end_time !== after.end_time) {
    entries.push({
      action: 'event.time_changed',
      metadata: {
        from: [before.start_time, before.end_time],
        to: [after.start_time, after.end_time],
      },
    });
  }
  if (before.status !== after.status) {
    entries.push({
      action: 'event.status_changed',
      metadata: { from: before.status, to: after.status },
    });
  }
  if ((before.important === 1) !== after.important) {
    entries.push({ action: 'event.importance_changed', metadata: { important: after.important } });
  }
  if ((before.is_public === 1) !== after.is_public) {
    entries.push({ action: 'event.visibility_changed', metadata: { is_public: after.is_public } });
  }

  if (entries.length === 0) {
    entries.push({ action: 'event.updated', metadata: {} });
  }
  return entries;
}

export { getEventRow, todayISO };
