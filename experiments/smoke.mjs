// Quick smoke test for the dedup-log library.
// Not part of the test suite; run manually with `node experiments/smoke.mjs`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDedupLog, rotate } from '../src/index.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dedup-log-smoke-'));
console.log('logs dir:', dir);

let day = 1;
const log = createDedupLog({
  dir,
  level: 'info',
  now: () => new Date(`2026-01-0${day}T12:00:00Z`),
  globalDictionary: { enabled: false },
});

for (let i = 0; i < 3; i++) {
  log(() => `request handled ok #${i}`);
  log.error('boom');
}

day = 2;
log('first write of new day -> triggers rotation');
log.close();

console.log('files:', fs.readdirSync(dir));
console.log('--- 2026-01-01.log.lino ---');
console.log(fs.readFileSync(path.join(dir, '2026-01-01.log.lino'), 'utf8'));

console.log('--- manual rotate of day 2 ---');
console.log(rotate({ dir, date: '2026-01-02' }));
console.log(fs.readFileSync(path.join(dir, '2026-01-02.log.lino'), 'utf8'));
