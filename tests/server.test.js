import { describe, it, expect } from 'test-anywhere';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.js';

const tempDir = (label) =>
  fs.mkdtempSync(path.join(os.tmpdir(), `dedup-log-server-${label}-`));

const ensureFetch = () => typeof fetch === 'function';

const start = (opts) =>
  new Promise((resolve, reject) => {
    const server = startServer({ host: '127.0.0.1', port: 0, ...opts });
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });

const stop = (server) =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const baseUrl = (server) => {
  const addr = server.address();
  return `http://127.0.0.1:${addr.port}`;
};

describe('dedup-log HTTP server', () => {
  it('serves /healthz', async () => {
    if (!ensureFetch()) {
      return;
    }
    const dir = tempDir('healthz');
    const server = await start({ dir });
    try {
      const res = await fetch(`${baseUrl(server)}/healthz`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.dir).toBe(dir);
    } finally {
      await stop(server);
    }
  });

  it('accepts POST /log and lists logs', async () => {
    if (!ensureFetch()) {
      return;
    }
    const dir = tempDir('log');
    const server = await start({ dir });
    try {
      const post = await fetch(`${baseUrl(server)}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { level: 'info', message: 'one' },
          { level: 'error', message: 'two' },
        ]),
      });
      expect(post.status).toBe(202);
      const list = await (await fetch(`${baseUrl(server)}/logs`)).json();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(1);
      expect(list[0].raw).toBe(true);
    } finally {
      await stop(server);
    }
  });

  it('rotates via POST /rotate', async () => {
    if (!ensureFetch()) {
      return;
    }
    const dir = tempDir('rotate');
    const server = await start({ dir });
    try {
      await fetch(`${baseUrl(server)}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'repeat' }),
      });
      await fetch(`${baseUrl(server)}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'repeat' }),
      });

      const today = fs
        .readdirSync(dir)
        .find((n) => n.endsWith('.log'))
        .slice(0, 10);

      const res = await fetch(`${baseUrl(server)}/rotate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(fs.existsSync(path.join(dir, `${today}.log.lino`))).toBe(true);
    } finally {
      await stop(server);
    }
  });

  it('returns 404 for unknown routes', async () => {
    if (!ensureFetch()) {
      return;
    }
    const dir = tempDir('404');
    const server = await start({ dir });
    try {
      const res = await fetch(`${baseUrl(server)}/no-such-route`);
      expect(res.status).toBe(404);
    } finally {
      await stop(server);
    }
  });

  it('rejects invalid log levels', async () => {
    if (!ensureFetch()) {
      return;
    }
    const dir = tempDir('bad-level');
    const server = await start({ dir });
    try {
      const res = await fetch(`${baseUrl(server)}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level: 'nope', message: 'x' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await stop(server);
    }
  });
});
