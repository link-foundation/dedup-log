#!/usr/bin/env node
/**
 * dedup-log — command line interface.
 *
 *   dedup-log log [--dir=DIR] [--level=NAME] <message...>
 *   dedup-log rotate [--dir=DIR] [--date=YYYY-MM-DD] [--remove-raw]
 *                    [--threshold=N] [--no-auto-escape]
 *                    [--import-dictionary=PATH | --no-import-dictionary]
 *   dedup-log build-dictionary [--dir=DIR] [--min-days=N] [--window-days=N]
 *   dedup-log inspect <file>
 *   dedup-log serve   [--dir=DIR] [--host=HOST] [--port=PORT]
 *   dedup-log help
 *   dedup-log version
 *
 * Defaults:
 *   --dir       env DEDUP_LOG_DIR or ./logs
 *   --level     info
 *   --date      yesterday (UTC)
 *   --threshold 1
 *   --port      env PORT or 8787
 *   --host      env HOST or 127.0.0.1
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildGlobalDictionary,
  createDedupLog,
  formatDate,
  rotate,
  splitDictionary,
} from '../src/index.js';

const HELP = `dedup-log — lazy daily logger that deduplicates closed logs into Lino.

USAGE
  dedup-log log [--dir=DIR] [--level=NAME] <message...>
  dedup-log rotate [--dir=DIR] [--date=YYYY-MM-DD] [--remove-raw]
                   [--threshold=N] [--no-auto-escape]
                   [--import-dictionary=PATH | --no-import-dictionary]
  dedup-log build-dictionary [--dir=DIR] [--min-days=N] [--window-days=N]
  dedup-log inspect <file>
  dedup-log serve   [--dir=DIR] [--host=HOST] [--port=PORT]
  dedup-log help
  dedup-log version

DEFAULTS
  --dir       $DEDUP_LOG_DIR or ./logs
  --level     info
  --date      yesterday (UTC)
  --threshold 1
  --port      $PORT or 8787
  --host      $HOST or 127.0.0.1
`;

const parseArgs = (argv) => {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') {
      for (i++; i < argv.length; i++) {
        positional.push(argv[i]);
      }
      break;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq >= 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const name = token.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[name] = next;
          i++;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
};

const resolveDir = (flags) => {
  const dir = flags.dir ?? process.env.DEDUP_LOG_DIR ?? './logs';
  return path.resolve(dir);
};

const isFlagSet = (flags, name) =>
  Object.prototype.hasOwnProperty.call(flags, name);

const die = (message, code = 1) => {
  process.stderr.write(`dedup-log: ${message}\n`);
  process.exit(code);
};

const getPackageInfo = () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve(here, '..', 'package.json'), 'utf8')
  );
  return { name: pkg.name, version: pkg.version };
};

const cmdLog = (positional, flags) => {
  if (positional.length === 0) {
    die('log requires a <message>');
  }
  const dir = resolveDir(flags);
  const level = flags.level ?? 'info';
  const log = createDedupLog({
    dir,
    level,
    rotateOnDateChange: false,
    globalDictionary: { enabled: false },
  });
  const message = positional.join(' ');
  const fn = typeof log[level] === 'function' ? log[level] : log;
  fn(message);
  log.close();
  process.stdout.write(`wrote ${level} message to ${dir}\n`);
};

const cmdRotate = (positional, flags) => {
  if (positional.length > 0) {
    die(`rotate does not take positional args (got ${positional.join(' ')})`);
  }
  const dir = resolveDir(flags);
  const date = flags.date
    ? flags.date
    : formatDate(new Date(Date.now() - 86_400_000));
  let importDictionary;
  if (isFlagSet(flags, 'no-import-dictionary')) {
    importDictionary = null;
  } else if (typeof flags['import-dictionary'] === 'string') {
    importDictionary = flags['import-dictionary'];
  }
  const result = rotate({
    dir,
    date,
    threshold:
      flags.threshold !== undefined ? Number(flags.threshold) : undefined,
    autoEscape: !isFlagSet(flags, 'no-auto-escape'),
    removeRaw: isFlagSet(flags, 'remove-raw'),
    importDictionary,
  });
  process.stdout.write(`${JSON.stringify(serialiseResult(result), null, 2)}\n`);
  if (
    !result.success &&
    result.reason !== 'No deduplication patterns produced'
  ) {
    process.exitCode = 2;
  }
};

const cmdBuildDictionary = (_positional, flags) => {
  const dir = resolveDir(flags);
  const result = buildGlobalDictionary({
    dir,
    minDays:
      flags['min-days'] !== undefined ? Number(flags['min-days']) : undefined,
    windowDays:
      flags['window-days'] !== undefined
        ? Number(flags['window-days'])
        : undefined,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.built) {
    process.exitCode = 2;
  }
};

const cmdInspect = (positional) => {
  if (positional.length !== 1) {
    die('inspect requires exactly one <file>');
  }
  const file = path.resolve(positional[0]);
  if (!fs.existsSync(file)) {
    die(`file not found: ${file}`);
  }
  const raw = fs.readFileSync(file, 'utf8');
  const { dictionary, body } = splitDictionary(raw);
  const summary = {
    file,
    bytes: Buffer.byteLength(raw, 'utf8'),
    lines: raw.split('\n').filter(Boolean).length,
    bodyLines: body.split('\n').filter(Boolean).length,
    dictionaryEntries: dictionary.size,
  };
  if (dictionary.size > 0) {
    summary.dictionary = Array.from(dictionary.entries()).map(
      ([id, pattern]) => ({
        id: Number(id),
        pattern,
      })
    );
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

const cmdServe = async (_positional, flags) => {
  const { startServer } = await import('../src/server.js');
  const dir = resolveDir(flags);
  const host = flags.host ?? process.env.HOST ?? '127.0.0.1';
  const port = Number(flags.port ?? process.env.PORT ?? 8787);
  const server = startServer({ dir, host, port });
  process.stdout.write(
    `dedup-log server listening on http://${host}:${port} (logs: ${dir})\n`
  );
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

const serialiseResult = (result) => {
  if (!result || typeof result !== 'object') {
    return result;
  }
  const copy = { ...result };
  if (copy.dictionary instanceof Map) {
    copy.dictionary = Object.fromEntries(copy.dictionary);
  }
  return copy;
};

const main = async () => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || ['help', '--help', '-h'].includes(argv[0])) {
    process.stdout.write(HELP);
    return;
  }
  if (['version', '--version', '-v'].includes(argv[0])) {
    const { name, version } = getPackageInfo();
    process.stdout.write(`${name} ${version}\n`);
    return;
  }
  const [command, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  switch (command) {
    case 'log':
      cmdLog(positional, flags);
      break;
    case 'rotate':
      cmdRotate(positional, flags);
      break;
    case 'build-dictionary':
      cmdBuildDictionary(positional, flags);
      break;
    case 'inspect':
      cmdInspect(positional);
      break;
    case 'serve':
      await cmdServe(positional, flags);
      break;
    default:
      die(`unknown command "${command}". Run "dedup-log help".`);
  }
};

main().catch((err) => {
  process.stderr.write(`dedup-log: ${err.stack ?? err.message ?? err}\n`);
  process.exit(1);
});
