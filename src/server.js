/**
 * dedup-log — minimal HTTP microservice.
 *
 * Endpoints:
 *
 *   GET  /healthz                → {ok:true,version,dir}
 *   GET  /logs                   → list of {date, raw, lino} entries
 *   GET  /logs/:date             → raw .log content (text/plain)
 *   GET  /logs/:date/lino        → .log.lino content (text/plain)
 *   GET  /dictionary             → dictionary.log.lino content
 *   POST /log                    → {level?, message} or [{level?,message}, …]
 *   POST /rotate                 → {date?, threshold?, autoEscape?, removeRaw?,
 *                                  importDictionary?}
 *   POST /build-dictionary       → {minDays?, windowDays?, threshold?, autoEscape?}
 *
 * The server is intentionally dependency-free (Node `http` only) so the same
 * binary that ships the CLI can serve the HTTP surface without pulling in
 * Express/Fastify.
 */

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGlobalDictionary,
  createDedupLog,
  dictionaryPath,
  formatDate,
  linoPath,
  logPath,
  parseDate,
  rotate,
} from './index.js';

const VALID_LEVELS = new Set([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'verbose',
  'trace',
  'silly',
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(here, '..', 'package.json'), 'utf8')
);

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
};

const text = (res, status, payload, type = 'text/plain; charset=utf-8') => {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

const readBody = (req, { limit = 1_048_576 } = {}) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const parseJson = (raw) => {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error(`Invalid JSON body: ${err.message}`), {
      status: 400,
    });
  }
};

const serialiseRotate = (result) => {
  const copy = { ...result };
  if (copy.dictionary instanceof Map) {
    copy.dictionary = Object.fromEntries(copy.dictionary);
  }
  return copy;
};

const handleListLogs = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const map = new Map();
  for (const name of fs.readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.log(\.lino)?$/.exec(name);
    if (!m) {
      continue;
    }
    const date = m[1];
    if (!map.has(date)) {
      map.set(date, { date, raw: false, lino: false });
    }
    if (m[2]) {
      map.get(date).lino = true;
    } else {
      map.get(date).raw = true;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const handleReadDated = (dir, dateStr, isLino) => {
  const dateObj = parseDate(dateStr);
  const file = isLino ? linoPath(dir, dateObj) : logPath(dir, dateObj);
  if (!fs.existsSync(file)) {
    return { status: 404, body: { error: 'not found', file } };
  }
  return { status: 200, text: fs.readFileSync(file, 'utf8') };
};

const handlePostLog = async (req, log) => {
  const body = parseJson(await readBody(req));
  if (!body) {
    throw Object.assign(new Error('Body required'), { status: 400 });
  }
  const entries = Array.isArray(body) ? body : [body];
  let written = 0;
  for (const entry of entries) {
    const level = entry.level ?? 'info';
    if (!VALID_LEVELS.has(level)) {
      throw Object.assign(new Error(`Invalid level "${level}"`), {
        status: 400,
      });
    }
    if (typeof entry.message !== 'string') {
      throw Object.assign(new Error('"message" must be a string'), {
        status: 400,
      });
    }
    const fn = log[level];
    if (typeof fn === 'function') {
      fn(entry.message);
    } else {
      log(entry.message);
    }
    written++;
  }
  return { accepted: written };
};

const handlePostRotate = async (req, dir) => {
  const body = parseJson(await readBody(req)) ?? {};
  const date = body.date ?? formatDate(new Date(Date.now() - 86_400_000));
  return serialiseRotate(
    rotate({
      dir,
      date,
      threshold: body.threshold,
      autoEscape: body.autoEscape,
      removeRaw: body.removeRaw,
      importDictionary: body.importDictionary,
    })
  );
};

const handlePostBuildDictionary = async (req, dir) => {
  const body = parseJson(await readBody(req)) ?? {};
  return buildGlobalDictionary({
    dir,
    minDays: body.minDays,
    windowDays: body.windowDays,
    threshold: body.threshold,
    autoEscape: body.autoEscape,
  });
};

const dispatch = async ({ method, pathname, req, dir, log }) => {
  const route = `${method} ${pathname}`;
  if (route === 'GET /healthz') {
    return { status: 200, body: { ok: true, version: pkg.version, dir } };
  }
  if (route === 'GET /logs') {
    return { status: 200, body: handleListLogs(dir) };
  }
  const dateMatch = pathname.match(/^\/logs\/(\d{4}-\d{2}-\d{2})(\/lino)?$/);
  if (method === 'GET' && dateMatch) {
    return handleReadDated(dir, dateMatch[1], Boolean(dateMatch[2]));
  }
  if (route === 'GET /dictionary') {
    const file = dictionaryPath(dir);
    if (!fs.existsSync(file)) {
      return { status: 404, body: { error: 'dictionary not built yet' } };
    }
    return { status: 200, text: fs.readFileSync(file, 'utf8') };
  }
  if (route === 'POST /log') {
    return { status: 202, body: await handlePostLog(req, log) };
  }
  if (route === 'POST /rotate') {
    return { status: 200, body: await handlePostRotate(req, dir) };
  }
  if (route === 'POST /build-dictionary') {
    return { status: 200, body: await handlePostBuildDictionary(req, dir) };
  }
  return { status: 404, body: { error: 'route not found', route } };
};

/**
 * Build the request handler. Exposed so tests can drive it directly.
 */
export const createHandler =
  ({ dir, log }) =>
  async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method?.toUpperCase() ?? 'GET';
      const result = await dispatch({
        method,
        pathname: url.pathname,
        req,
        dir,
        log,
      });
      if (result.text !== undefined) {
        text(res, result.status, result.text);
      } else {
        json(res, result.status, result.body);
      }
    } catch (err) {
      const status = err.status ?? 500;
      json(res, status, { error: err.message });
    }
  };

/**
 * Boot a dedup-log HTTP server. Returns the underlying `http.Server` so the
 * caller can `server.address()` / `server.close()`.
 */
export const startServer = ({
  dir,
  host = '127.0.0.1',
  port = 8787,
  // 'all' so HTTP clients can pick any level and it gets recorded; log-lazy
  // uses bitmask levels, not severity ladders, so 'info' would silently
  // discard error/warn writes.
  level = 'all',
  log,
} = {}) => {
  if (!dir) {
    throw new Error('startServer requires "dir"');
  }
  const logger =
    log ??
    createDedupLog({
      dir,
      level,
      rotateOnDateChange: true,
    });
  const handler = createHandler({ dir, log: logger });
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      process.stderr.write(`dedup-log server: ${err.stack ?? err.message}\n`);
      try {
        json(res, 500, { error: err.message });
      } catch {
        // response already sent
      }
    });
  });
  server.listen(port, host);
  server.on('close', () => {
    if (!log && typeof logger.close === 'function') {
      logger.close();
    }
  });
  return server;
};
