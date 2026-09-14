// tsc only emits JavaScript, so the SQL schema is copied into dist by hand.
const fs = require('node:fs');
const path = require('node:path');

const files = [['src/db/schema.sql', 'dist/db/schema.sql']];

for (const [from, to] of files) {
  const source = path.resolve(__dirname, '..', from);
  const target = path.resolve(__dirname, '..', to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[build] ${from} -> ${to}`);
}
