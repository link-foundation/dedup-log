import { describe, it, expect } from 'test-anywhere';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileSink } from '../src/file-sink.js';

const tempDir = (label) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `dedup-log-${label}-`));

describe('FileSink', () => {
  it('writes lines into a UTC-dated file', () => {
    const dir = tempDir('sink-write');
    const sink = new FileSink({
      dir,
      now: () => new Date('2026-05-10T12:00:00Z'),
    });
    sink.write('hello');
    sink.write('world');
    sink.close();
    const contents = fs.readFileSync(path.join(dir, '2026-05-10.log'), 'utf8');
    expect(contents).toBe('hello\nworld\n');
  });

  it('rotates lazily on the first write of a new day', () => {
    const dir = tempDir('sink-rotate');
    let day = 1;
    const rotated = [];
    const sink = new FileSink({
      dir,
      now: () => new Date(`2026-01-0${day}T08:00:00Z`),
      onRotate: (date) => rotated.push(date),
    });
    sink.write('day-one a');
    sink.write('day-one b');
    expect(rotated).toEqual([]);

    day = 2;
    sink.write('day-two a');
    expect(rotated).toEqual(['2026-01-01']);
    sink.close();

    expect(fs.readFileSync(path.join(dir, '2026-01-01.log'), 'utf8')).toBe(
      'day-one a\nday-one b\n'
    );
    expect(fs.readFileSync(path.join(dir, '2026-01-02.log'), 'utf8')).toBe(
      'day-two a\n'
    );
  });

  it('appends a trailing newline only when missing', () => {
    const dir = tempDir('sink-newline');
    const sink = new FileSink({
      dir,
      now: () => new Date('2026-05-10T12:00:00Z'),
    });
    sink.write('with-nl\n');
    sink.write('no-nl');
    sink.close();
    expect(fs.readFileSync(path.join(dir, '2026-05-10.log'), 'utf8')).toBe(
      'with-nl\nno-nl\n'
    );
  });

  it('throws when constructed without a dir', () => {
    let threw = false;
    try {
      new FileSink({});
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
