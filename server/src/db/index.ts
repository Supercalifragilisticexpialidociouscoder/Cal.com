import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

let instance: Database.Database | null = null;

function resolveSchemaPath(): string {
  // src/db/schema.sql during development (tsx), dist/db/schema.sql after build.
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.resolve(__dirname, '../../src/db/schema.sql'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not locate schema.sql. Looked in: ${candidates.join(', ')}`);
}

export function getDb(): Database.Database {
  if (instance) return instance;

  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const db = new Database(config.databaseFile);
  // WAL keeps reads fast while an admin writes - the public calendar never blocks.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(fs.readFileSync(resolveSchemaPath(), 'utf8'));

  instance = db;
  return db;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Removes expired sessions. Cheap enough to run on an interval. */
export function pruneExpiredSessions(): number {
  const result = getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= datetime('now')`)
    .run();
  return result.changes;
}

export type Db = Database.Database;
