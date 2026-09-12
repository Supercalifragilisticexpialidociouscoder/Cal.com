-- ---------------------------------------------------------------------------
-- MRTC Calendar schema
--
-- Deliberately small and relational. Deadlines are events with
-- event_type = 'deadline' rather than a parallel table, so every calendar
-- query, filter and responsibility checklist works for them unchanged.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('super_admin', 'staff_admin')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Server side sessions. Only the SHA-256 of the token is stored, so a database
-- leak cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT    NOT NULL DEFAULT (datetime('now')),
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Clubs, departments and other organisers. `type` drives the "Source" filter
-- and the restrained colour system - not one colour per club.
CREATE TABLE IF NOT EXISTS organizations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  slug    TEXT    NOT NULL UNIQUE,
  type    TEXT    NOT NULL CHECK (type IN ('institution', 'department', 'club', 'academic', 'other')),
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type, active);

CREATE TABLE IF NOT EXISTS venues (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  active  INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  description     TEXT    NOT NULL DEFAULT '',
  event_type      TEXT    NOT NULL DEFAULT 'event'
                    CHECK (event_type IN ('event', 'meeting', 'workshop', 'seminar', 'deadline',
                                          'competition', 'academic', 'examination', 'faculty', 'other')),
  organizer_id    INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  organizer_name  TEXT    NOT NULL DEFAULT 'MRTC',
  event_date      TEXT    NOT NULL,                  -- YYYY-MM-DD
  start_time      TEXT,                               -- HH:MM, null when all day
  end_time        TEXT,                               -- HH:MM, null when all day
  all_day         INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  location        TEXT    NOT NULL DEFAULT '',
  status          TEXT    NOT NULL DEFAULT 'planning'
                    CHECK (status IN ('planning', 'confirmed', 'ongoing', 'completed', 'cancelled')),
  important       INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
  is_public       INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  repeat_rule     TEXT    NOT NULL DEFAULT 'none'
                    CHECK (repeat_rule IN ('none', 'daily', 'weekly', 'monthly', 'custom')),
  repeat_interval INTEGER NOT NULL DEFAULT 1,
  repeat_until    TEXT,
  parent_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  -- Soft delete: important records are archived, never dropped (spec 45).
  deleted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date, start_time);
CREATE INDEX IF NOT EXISTS idx_events_live ON events(deleted_at, event_date);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(location);

CREATE TABLE IF NOT EXISTS responsibilities (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  -- A responsibility can sit with an admin account, a free-text team/club, or both.
  assigned_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_team     TEXT    NOT NULL DEFAULT '',
  note              TEXT    NOT NULL DEFAULT '',
  due_at            TEXT,
  status            TEXT    NOT NULL DEFAULT 'not_started'
                      CHECK (status IN ('not_started', 'in_progress', 'completed')),
  public_visibility INTEGER NOT NULL DEFAULT 0 CHECK (public_visibility IN (0, 1)),
  position          INTEGER NOT NULL DEFAULT 0,
  completed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at      TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resp_event ON responsibilities(event_id, position);
CREATE INDEX IF NOT EXISTS idx_resp_assignee ON responsibilities(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_resp_team ON responsibilities(assigned_team);

-- Private to their author. No endpoint ever returns another user's rows -
-- not even to the super admin (spec 14).
CREATE TABLE IF NOT EXISTS quick_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL DEFAULT '',
  pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quick_notes_owner ON quick_notes(user_id, archived, pinned, updated_at);

-- Attached to an event and visible to authenticated admins (spec 17).
CREATE TABLE IF NOT EXISTS event_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_notes_event ON event_notes(event_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  file_name         TEXT    NOT NULL,
  stored_name       TEXT    NOT NULL UNIQUE,
  mime_type         TEXT    NOT NULL DEFAULT 'application/octet-stream',
  size_bytes        INTEGER NOT NULL DEFAULT 0,
  public_visibility INTEGER NOT NULL DEFAULT 0 CHECK (public_visibility IN (0, 1)),
  uploaded_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_event ON attachments(event_id, created_at);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT    NOT NULL,
  metadata   TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_event ON activity_log(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_recent ON activity_log(created_at);

-- Small key/value store for system settings and the schema version.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
