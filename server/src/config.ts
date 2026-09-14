import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

// Load .env from the repository root first, then the server folder, so either
// layout works without extra configuration.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const isProduction = process.env.NODE_ENV === 'production';

function requiredSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16 && fromEnv !== 'change-me-in-production-please-use-a-long-random-value') {
    return fromEnv;
  }
  if (isProduction) {
    throw new Error(
      'SESSION_SECRET must be set to a strong random value (>= 16 chars) when NODE_ENV=production.'
    );
  }
  // Development convenience only: a random secret means sessions do not survive
  // a restart, which is the safe default for local work.
  return crypto.randomBytes(32).toString('base64url');
}

const dataDirRaw = process.env.DATA_DIR?.trim() || './data';
const dataDir = path.isAbsolute(dataDirRaw)
  ? dataDirRaw
  : path.resolve(__dirname, '..', dataDirRaw);

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  sessionSecret: requiredSecret(),
  dataDir,
  databaseFile: path.join(dataDir, 'mrtc-calendar.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  /** Static assets of the built SPA, served by this process in production. */
  webDistDir: path.resolve(__dirname, '../../web/dist'),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  session: {
    cookieName: 'mrtc_sid',
    /** Readable (non-sensitive) hint so public visitors never call /auth/me. */
    hintCookieName: 'mrtc_session_hint',
    ttlMs: 1000 * 60 * 60 * 12, // 12 hours
    /** Sessions older than this much idle time are refreshed on use. */
    refreshAfterMs: 1000 * 60 * 30,
  },
  uploads: {
    maxBytes: 15 * 1024 * 1024,
    maxPerEvent: 25,
  },
  login: {
    maxAttempts: 8,
    windowMs: 1000 * 60 * 10,
  },
  seed: {
    demoData: (process.env.SEED_DEMO_DATA ?? 'true') !== 'false',
    superAdmin: {
      name: process.env.SEED_SUPER_ADMIN_NAME ?? 'MRTC Super Admin',
      email: (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@mrtc.edu').toLowerCase(),
      password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'mrtc-super-admin',
    },
    staff: [
      {
        name: process.env.SEED_STAFF_ONE_NAME ?? 'Staff Admin One',
        email: (process.env.SEED_STAFF_ONE_EMAIL ?? 'staff1@mrtc.edu').toLowerCase(),
        password: process.env.SEED_STAFF_ONE_PASSWORD ?? 'mrtc-staff-one',
      },
      {
        name: process.env.SEED_STAFF_TWO_NAME ?? 'Staff Admin Two',
        email: (process.env.SEED_STAFF_TWO_EMAIL ?? 'staff2@mrtc.edu').toLowerCase(),
        password: process.env.SEED_STAFF_TWO_PASSWORD ?? 'mrtc-staff-two',
      },
    ],
  },
} as const;

/** Exactly two staff admin accounts are authorised by the product spec. */
export const MAX_STAFF_ADMINS = 2;
