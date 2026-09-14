import fs from 'node:fs';
import { config } from '../config';

/**
 * Deletes the database and uploaded files so the next boot seeds from scratch.
 * Intended for local development only.
 */
function reset(): void {
  if (config.isProduction) {
    console.error('[infin8-calendar] refusing to reset the database with NODE_ENV=production.');
    process.exit(1);
  }

  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${config.databaseFile}${suffix}`;
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      console.log(`[infin8-calendar] removed ${file}`);
    }
  }

  if (fs.existsSync(config.uploadsDir)) {
    fs.rmSync(config.uploadsDir, { recursive: true, force: true });
    console.log(`[infin8-calendar] removed ${config.uploadsDir}`);
  }

  console.log('[infin8-calendar] reset complete. Start the server to seed again.');
}

reset();
