import { describe, it, expect } from 'test-anywhere';
import path from 'node:path';
import {
  formatDate,
  parseDate,
  dayDiff,
  logPath,
  linoPath,
  dictionaryPath,
} from '../src/paths.js';

describe('formatDate', () => {
  it('formats UTC dates as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02');
    expect(formatDate(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12-31');
  });

  it('uses UTC components, not local time', () => {
    expect(formatDate(new Date('2026-05-10T23:59:59Z'))).toBe('2026-05-10');
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatDate(new Date('2026-01-09T12:00:00Z'))).toBe('2026-01-09');
  });
});

describe('parseDate', () => {
  it('parses YYYY-MM-DD as UTC midnight', () => {
    const d = parseDate('2026-05-10');
    expect(d.toISOString()).toBe('2026-05-10T00:00:00.000Z');
  });

  it('rejects malformed strings', () => {
    let threw = false;
    try {
      parseDate('05/10/2026');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('dayDiff', () => {
  it('returns the integer day delta', () => {
    expect(
      dayDiff(
        new Date('2026-05-12T03:00:00Z'),
        new Date('2026-05-10T22:00:00Z')
      )
    ).toBe(2);
  });

  it('returns 0 for the same UTC day', () => {
    expect(
      dayDiff(
        new Date('2026-05-10T00:00:00Z'),
        new Date('2026-05-10T23:00:00Z')
      )
    ).toBe(0);
  });
});

describe('path helpers', () => {
  const dir = path.join('/tmp', 'fake-logs');
  const date = new Date('2026-05-10T12:00:00Z');

  it('places .log files inside the dir', () => {
    expect(logPath(dir, date)).toBe(path.join(dir, '2026-05-10.log'));
  });

  it('places .log.lino files inside the dir', () => {
    expect(linoPath(dir, date)).toBe(path.join(dir, '2026-05-10.log.lino'));
  });

  it('places dictionary.log.lino at the dir root', () => {
    expect(dictionaryPath(dir)).toBe(path.join(dir, 'dictionary.log.lino'));
  });
});
