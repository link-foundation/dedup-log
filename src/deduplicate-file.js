import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dictionaryPath,
  formatDate,
  linoPath,
  logPath,
  parseDate,
} from './paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Locate the deduplino CLI bundle. We prefer the version installed as a
 * dependency, then fall back to a sibling node_modules directory used in
 * source checkouts.
 */
const findDeduplinoCli = () => {
  const candidates = [
    path.resolve(here, '..', 'node_modules', 'deduplino', 'dist', 'index.js'),
    path.resolve(here, '..', '..', 'deduplino', 'dist', 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    'Could not locate deduplino CLI; ensure "deduplino" is installed.'
  );
};

const runDeduplino = (input, { threshold, autoEscape }) => {
  const cli = findDeduplinoCli();
  const args = [
    cli,
    '--piped-input',
    '--deduplication-threshold',
    String(threshold),
  ];
  if (autoEscape) {
    args.push('--auto-escape');
  }
  const result = spawnSync(process.execPath, args, {
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `deduplino exited with status ${result.status}: ${result.stderr.trim()}`
    );
  }
  return result.stdout;
};

const PATTERN_LINE_RE = /^\s*(\d+):\s+(.+)$/;

/**
 * Pull dictionary entries (`N: pattern …`) from a deduplino output stream.
 * Returns the parsed map plus the body lines stripped of dictionary rows.
 */
export const splitDictionary = (output) => {
  const dictionary = new Map();
  const body = [];
  for (const line of output.split('\n')) {
    const match = PATTERN_LINE_RE.exec(line);
    if (match) {
      dictionary.set(match[1], match[2]);
    } else {
      body.push(line);
    }
  }
  return {
    dictionary,
    body: body.join('\n').replace(/\n+$/, '\n'),
  };
};

/**
 * Render a dictionary map back into Lino dictionary lines (sorted by id).
 */
export const formatDictionary = (dictionary) => {
  const ids = Array.from(dictionary.keys()).sort(
    (a, b) => Number(a) - Number(b)
  );
  return ids.map((id) => `${id}: ${dictionary.get(id)}`).join('\n');
};

const buildLinoOutput = (deduped, importDictionary) => {
  const header = importDictionary
    ? `(import dictionary "${importDictionary}")\n`
    : '';
  const tail = deduped.endsWith('\n') ? deduped : `${deduped}\n`;
  return `${header}${tail}`;
};

const writeAndMaybeRemove = ({
  targetPath,
  content,
  removeRaw,
  sourcePath,
}) => {
  fs.writeFileSync(targetPath, content, 'utf8');
  if (removeRaw) {
    fs.unlinkSync(sourcePath);
  }
};

/**
 * Run deduplino on a closed daily log and write the resulting `.log.lino`
 * file. Returns the same `DeduplicationResult`-style summary plus the
 * paths involved.
 *
 * @param {object} options
 * @param {string} options.dir       Logs directory.
 * @param {string|Date} options.date Date of the log to deduplicate.
 * @param {number} [options.threshold=1.0] Dedup threshold (0-1). Default 1.0
 *   so locally repeated fragments are always lifted into the dictionary.
 * @param {boolean} [options.autoEscape=true] Pass `--auto-escape` so raw
 *   log lines (timestamps, URLs) parse as Lino.
 * @param {boolean} [options.removeRaw=false] Delete the raw `.log` after
 *   successful deduplication.
 * @param {string} [options.importDictionary] Optional path placed in a
 *   `(import dictionary "...")` header so consumers know where to resolve
 *   shared fragments.
 */
export const rotate = ({
  dir,
  date,
  threshold = 1.0,
  autoEscape = true,
  removeRaw = false,
  importDictionary,
} = {}) => {
  if (!dir) {
    throw new Error('rotate() requires a "dir"');
  }
  if (!date) {
    throw new Error('rotate() requires a "date"');
  }
  const dateObj = typeof date === 'string' ? parseDate(date) : date;
  const stamp = formatDate(dateObj);
  const sourcePath = logPath(dir, dateObj);
  const targetPath = linoPath(dir, dateObj);
  const summary = { date: stamp, sourcePath, targetPath };

  if (!fs.existsSync(sourcePath)) {
    return {
      ...summary,
      success: false,
      reason: 'Source log not found',
      patternsApplied: 0,
    };
  }

  const raw = fs.readFileSync(sourcePath, 'utf8');
  if (!raw.trim()) {
    writeAndMaybeRemove({ targetPath, content: raw, removeRaw, sourcePath });
    return {
      ...summary,
      success: false,
      reason: 'Empty log',
      patternsApplied: 0,
    };
  }

  const deduped = runDeduplino(raw, { threshold, autoEscape });
  const { dictionary } = splitDictionary(deduped);
  const finalOutput = buildLinoOutput(deduped, importDictionary);
  writeAndMaybeRemove({
    targetPath,
    content: finalOutput,
    removeRaw,
    sourcePath,
  });

  return {
    ...summary,
    success: dictionary.size > 0,
    reason:
      dictionary.size > 0 ? undefined : 'No deduplication patterns produced',
    patternsApplied: dictionary.size,
    dictionary,
    importDictionary: importDictionary || null,
  };
};

const collectRotatedDates = (dir) => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.log$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort();
};

/**
 * Build (or refresh) a global dictionary by combining the most recent
 * daily logs and re-running deduplino across the union. The result is
 * written to `<dir>/dictionary.log.lino` as a sequence of `N: pattern`
 * lines.
 */
export const buildGlobalDictionary = ({
  dir,
  minDays = 8,
  windowDays = 14,
  threshold = 1.0,
  autoEscape = true,
} = {}) => {
  if (!dir) {
    throw new Error('buildGlobalDictionary() requires a "dir"');
  }
  const dates = collectRotatedDates(dir);
  if (dates.length < minDays) {
    return {
      built: false,
      reason: `Need at least ${minDays} days of logs, found ${dates.length}`,
      path: dictionaryPath(dir),
      patterns: 0,
      days: dates.length,
    };
  }
  const recent = dates.slice(-windowDays);
  const combined = recent
    .map((d) => fs.readFileSync(path.join(dir, `${d}.log`), 'utf8'))
    .join('\n');
  const deduped = runDeduplino(combined, { threshold, autoEscape });
  const { dictionary } = splitDictionary(deduped);
  const target = dictionaryPath(dir);
  const body = formatDictionary(dictionary);
  fs.writeFileSync(target, `${body}\n`, 'utf8');
  return {
    built: true,
    path: target,
    patterns: dictionary.size,
    days: recent.length,
    coveredDates: recent,
  };
};
