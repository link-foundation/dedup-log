import { describe, it, expect } from 'test-anywhere';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildGlobalDictionary,
  formatDictionary,
  rotate,
  splitDictionary,
} from '../src/index.js';

const tempDir = (label) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `dedup-log-${label}-`));

describe('splitDictionary', () => {
  it('extracts numeric pattern lines', () => {
    const { dictionary, body } = splitDictionary(
      ['1: hello world', '2: another', 'x foo', 'y bar'].join('\n')
    );
    expect(dictionary.get('1')).toBe('hello world');
    expect(dictionary.get('2')).toBe('another');
    expect(body).toContain('x foo');
    expect(body).toContain('y bar');
  });

  it('returns an empty map when no patterns match', () => {
    const { dictionary, body } = splitDictionary('plain line\nanother\n');
    expect(dictionary.size).toBe(0);
    expect(body).toContain('plain line');
  });
});

describe('formatDictionary', () => {
  it('renders entries sorted by numeric id', () => {
    const out = formatDictionary(
      new Map([
        ['10', 'ten'],
        ['1', 'one'],
        ['2', 'two'],
      ])
    );
    expect(out).toBe('1: one\n2: two\n10: ten');
  });
});

describe('rotate', () => {
  it('writes a .log.lino file with a dictionary for repeated lines', () => {
    const dir = tempDir('rotate-ok');
    fs.writeFileSync(
      path.join(dir, '2026-05-10.log'),
      `${['hello world', 'hello world', 'unique line', 'hello world'].join(
        '\n'
      )}\n`
    );
    const result = rotate({ dir, date: '2026-05-10' });
    expect(result.success).toBe(true);
    expect(result.patternsApplied).toBeGreaterThan(0);
    expect(fs.existsSync(result.targetPath)).toBe(true);
  });

  it('reports a missing source log', () => {
    const dir = tempDir('rotate-missing');
    const result = rotate({ dir, date: '2026-05-10' });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Source log not found');
  });

  it('emits an (import dictionary "...") header when requested', () => {
    const dir = tempDir('rotate-import');
    fs.writeFileSync(
      path.join(dir, '2026-05-10.log'),
      `${['x', 'x', 'x'].join('\n')}\n`
    );
    rotate({
      dir,
      date: '2026-05-10',
      importDictionary: './dictionary.log.lino',
    });
    const out = fs.readFileSync(path.join(dir, '2026-05-10.log.lino'), 'utf8');
    expect(out.startsWith('(import dictionary "./dictionary.log.lino")')).toBe(
      true
    );
  });

  it('removes the raw .log when removeRaw is true', () => {
    const dir = tempDir('rotate-remove');
    const raw = path.join(dir, '2026-05-10.log');
    fs.writeFileSync(raw, `${['a', 'a', 'a'].join('\n')}\n`);
    rotate({ dir, date: '2026-05-10', removeRaw: true });
    expect(fs.existsSync(raw)).toBe(false);
  });
});

describe('buildGlobalDictionary', () => {
  it('refuses to build with too few days of history', () => {
    const dir = tempDir('global-too-few');
    fs.writeFileSync(path.join(dir, '2026-05-10.log'), 'x\nx\n');
    const result = buildGlobalDictionary({ dir, minDays: 5 });
    expect(result.built).toBe(false);
    expect(result.days).toBe(1);
  });

  it('builds a dictionary file when enough days exist', () => {
    const dir = tempDir('global-ok');
    for (let day = 1; day <= 4; day++) {
      const date = `2026-05-0${day}`;
      fs.writeFileSync(
        path.join(dir, `${date}.log`),
        `${['shared shared', 'shared shared', `unique ${day}`].join('\n')}\n`
      );
    }
    const result = buildGlobalDictionary({ dir, minDays: 3, windowDays: 7 });
    expect(result.built).toBe(true);
    expect(result.patterns).toBeGreaterThan(0);
    expect(fs.existsSync(result.path)).toBe(true);
    expect(result.coveredDates.length).toBe(4);
  });
});
