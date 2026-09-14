import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config';
import { getDb } from '../db';
import { logActivity } from '../lib/activity';
import { badRequest, conflict, notFound } from '../lib/errors';
import { serializeAttachment } from '../lib/serialize';
import type { AttachmentRow, EventRow } from '../lib/types';
import { assertAdmin, requireAdmin } from '../middleware/auth';
import { asyncRoute } from '../middleware/error';

export const attachmentsRouter = Router();

const storage = multer.diskStorage({
  destination(_req, _file, callback) {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    callback(null, config.uploadsDir);
  },
  filename(_req, file, callback) {
    // Never trust the uploaded name on disk. The original is kept in the
    // database and only used for the download filename.
    const extension = path.extname(file.originalname).slice(0, 12).replace(/[^.\w-]/g, '');
    callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
});

function loadEvent(eventId: number): EventRow {
  const row = getDb().prepare('SELECT * FROM events WHERE id = ?').get(eventId) as
    | EventRow
    | undefined;
  if (!row) throw notFound('That event no longer exists.');
  return row;
}

function safeOriginalName(name: string): string {
  const base = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (base || 'attachment').slice(0, 160);
}

/** POST /api/events/:eventId/attachments */
attachmentsRouter.post(
  '/events/:eventId/attachments',
  requireAdmin,
  upload.single('file'),
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const eventId = Number(req.params.eventId);
    const file = req.file;

    const cleanup = () => {
      if (file?.path) fs.rm(file.path, { force: true }, () => undefined);
    };

    if (!Number.isInteger(eventId) || eventId <= 0) {
      cleanup();
      throw notFound('That event no longer exists.');
    }
    if (!file) throw badRequest('Please choose a file to upload.');

    let event: EventRow;
    try {
      event = loadEvent(eventId);
    } catch (error) {
      cleanup();
      throw error;
    }

    const db = getDb();
    const existingCount = (
      db.prepare('SELECT COUNT(*) AS count FROM attachments WHERE event_id = ?').get(eventId) as {
        count: number;
      }
    ).count;
    if (existingCount >= config.uploads.maxPerEvent) {
      cleanup();
      throw conflict(
        `This event already has the maximum of ${config.uploads.maxPerEvent} files. Please remove one first.`
      );
    }

    // Administrative files are private unless explicitly published (spec 18).
    const isPublic = String(req.body?.public_visibility ?? 'false') === 'true';

    const result = db
      .prepare(
        `INSERT INTO attachments (event_id, file_name, stored_name, mime_type, size_bytes,
                                  public_visibility, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        eventId,
        safeOriginalName(file.originalname),
        path.basename(file.filename),
        file.mimetype || 'application/octet-stream',
        file.size,
        isPublic ? 1 : 0,
        viewer.id
      );

    logActivity('attachment.added', {
      eventId,
      viewer,
      metadata: { file_name: safeOriginalName(file.originalname), event_title: event.title },
    });

    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(result.lastInsertRowid)) as AttachmentRow;
    res.status(201).json({ attachment: serializeAttachment(row, viewer.name) });
  })
);

/** PATCH /api/attachments/:id - publish or unpublish a file. */
attachmentsRouter.patch(
  '/attachments/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That file no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined;
    if (!existing) throw notFound('That file no longer exists.');

    if (typeof req.body?.public_visibility !== 'boolean' && typeof req.body?.public_visibility !== 'string') {
      throw badRequest('Please say whether this file should be public.');
    }
    const isPublic = String(req.body.public_visibility) === 'true';

    db.prepare('UPDATE attachments SET public_visibility = ? WHERE id = ?').run(isPublic ? 1 : 0, id);
    logActivity('attachment.visibility_changed', {
      eventId: existing.event_id,
      viewer,
      metadata: { file_name: existing.file_name, is_public: isPublic },
    });

    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow;
    res.json({ attachment: serializeAttachment(row, viewer.name) });
  })
);

/** DELETE /api/attachments/:id */
attachmentsRouter.delete(
  '/attachments/:id',
  requireAdmin,
  asyncRoute((req, res) => {
    const viewer = assertAdmin(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That file no longer exists.');

    const db = getDb();
    const existing = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined;
    if (!existing) throw notFound('That file no longer exists.');

    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    const onDisk = path.join(config.uploadsDir, path.basename(existing.stored_name));
    fs.rm(onDisk, { force: true }, () => undefined);

    logActivity('attachment.removed', {
      eventId: existing.event_id,
      viewer,
      metadata: { file_name: existing.file_name },
    });
    res.json({ ok: true });
  })
);

/**
 * GET /api/attachments/:id/download
 *
 * The authorisation check lives here, on the server. A private file is
 * unreachable without a session even if its URL is known (spec 40).
 */
attachmentsRouter.get(
  '/attachments/:id/download',
  asyncRoute((req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound('That file no longer exists.');

    const db = getDb();
    const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
      | AttachmentRow
      | undefined;
    if (!row) throw notFound('That file no longer exists.');

    if (!req.viewer) {
      if (row.public_visibility !== 1) throw notFound('That file is not available.');
      const event = db
        .prepare('SELECT is_public, deleted_at FROM events WHERE id = ?')
        .get(row.event_id) as { is_public: number; deleted_at: string | null } | undefined;
      if (!event || event.is_public !== 1 || event.deleted_at !== null) {
        throw notFound('That file is not available.');
      }
    }

    const filePath = path.join(config.uploadsDir, path.basename(row.stored_name));
    if (!filePath.startsWith(config.uploadsDir) || !fs.existsSync(filePath)) {
      throw notFound('That file is no longer stored on the server.');
    }

    // Always download, never render: an uploaded HTML or SVG file must not be
    // able to execute script on this origin.
    const asciiName = row.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.sendFile(filePath);
  })
);
