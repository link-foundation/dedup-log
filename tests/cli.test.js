import { describe, it, expect } from 'test-anywhere';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const cli = fileURLToPath(new URL('../bin/dedup-log.js', import.meta.url));
const isDeno = typeof globalThis.Deno !== 'undefined';
const isBun = typeof globalThis.Bun !== 'undefined';
const skipSpawn = isDeno || isBun;

const tempDir = (label) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `dedup-log-cli-${label}-`));

const run = (args, opts = {}) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    ...opts,
  });

describe('dedup-log CLI', () => {
  it('prints help with no args', () => {
    if (skipSpawn) {
      return;
    }
    const result = run([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('USAGE');
  });

  it('prints version', () => {
    if (skipSpawn) {
      return;
    }
    const result = run(['version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dedup-log');
  });

  it('logs, rotates, and inspects in sequence', () => {
    if (skipSpawn) {
      return;
    }
    const dir = tempDir('flow');
    let r = run(['log', '--dir', dir, 'hello world']);
    expect(r.status).toBe(0);
    r = run(['log', '--dir', dir, 'hello world']);
    expect(r.status).toBe(0);
    r = run(['log', '--dir', dir, 'unique entry']);
    expect(r.status).toBe(0);

    const today = fs.readdirSync(dir).find((f) => f.endsWith('.log'));
    expect(today).toBeTruthy();
    const date = today.slice(0, 10);

    r = run(['rotate', '--dir', dir, '--date', date]);
    expect(r.status).toBe(0);
    const result = JSON.parse(r.stdout);
    expect(result.success).toBe(true);

    r = run(['inspect', path.join(dir, `${date}.log.lino`)]);
    expect(r.status).toBe(0);
    const info = JSON.parse(r.stdout);
    expect(info.dictionaryEntries).toBeGreaterThan(0);
  });

  it('rejects unknown commands with exit code 1', () => {
    if (skipSpawn) {
      return;
    }
    const result = run(['definitely-not-a-command']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown command');
  });
});
