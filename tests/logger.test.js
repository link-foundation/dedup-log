import { describe, it, expect } from 'test-anywhere';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDedupLog } from '../src/index.js';

const tempDir = (label) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `dedup-log-${label}-`));

describe('createDedupLog', () => {
  it('throws without a dir', () => {
    let threw = false;
    try {
      createDedupLog({});
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('writes timestamped lines to the active day file', () => {
    const dir = tempDir('logger-write');
    const log = createDedupLog({
      dir,
      level: 'info',
      now: () => new Date('2026-05-10T12:00:00Z'),
      globalDictionary: { enabled: false },
    });
    log('hello');
    log.close();
    const out = fs.readFileSync(path.join(dir, '2026-05-10.log'), 'utf8');
    expect(out).toBe('[2026-05-10T12:00:00.000Z] [INFO] hello\n');
  });

  it('honours the lazy interface (no eval when level disabled)', () => {
    const dir = tempDir('logger-lazy');
    let calls = 0;
    const log = createDedupLog({
      dir,
      level: 'error',
      now: () => new Date('2026-05-10T12:00:00Z'),
      globalDictionary: { enabled: false },
    });
    log.debug(() => {
      calls++;
      return 'should not run';
    });
    log.close();
    expect(calls).toBe(0);
  });

  it('rotates and produces a .log.lino on date change', () => {
    const dir = tempDir('logger-rotate');
    let day = 1;
    const log = createDedupLog({
      dir,
      level: 'info',
      now: () => new Date(`2026-01-0${day}T12:00:00Z`),
      globalDictionary: { enabled: false },
    });
    log('repeat');
    log('repeat');
    log('repeat');
    day = 2;
    log('new day');
    log.close();

    const lino = fs.readFileSync(path.join(dir, '2026-01-01.log.lino'), 'utf8');
    expect(lino.length).toBeGreaterThan(0);
    expect(lino).toMatch(/^\d+: /m);
  });

  it('exposes manual rotate() and buildGlobalDictionary()', () => {
    const dir = tempDir('logger-manual');
    const log = createDedupLog({
      dir,
      level: 'info',
      now: () => new Date('2026-05-10T12:00:00Z'),
      globalDictionary: { enabled: false },
    });
    log('first');
    log('first');
    log.close();

    const result = log.rotate({ date: '2026-05-10' });
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.targetPath)).toBe(true);

    const dict = log.buildGlobalDictionary({ minDays: 1, windowDays: 14 });
    expect(dict.built).toBe(true);
  });
});
