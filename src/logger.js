import makeLog, { levels } from 'log-lazy';
import { FileSink } from './file-sink.js';
import { buildGlobalDictionary, rotate } from './deduplicate-file.js';
import { dictionaryPath, formatDate } from './paths.js';

const LEVEL_NAMES = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'verbose',
  'trace',
  'silly',
];

const formatArg = (arg) => {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (arg && typeof arg === 'object') {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
};

const buildLine = (levelName, args, now, format) => {
  const ts = format(now());
  const msg = args.map(formatArg).join(' ');
  return `[${ts}] [${levelName.toUpperCase()}] ${msg}`;
};

const isoFormat = (date) => date.toISOString();

/**
 * Create a lazy logger backed by a daily-rotating file sink.
 *
 * The returned object IS the `log-lazy` `LogFunction` (callable + per-level
 * methods, `shouldLog`, `enableLevel`, …) augmented with three orchestration
 * helpers:
 *
 *   - `rotate({ date })`  Force-rotate a given date (default: yesterday).
 *   - `buildGlobalDictionary({ minDays, windowDays })` Build the shared
 *     dictionary if enough days of history exist.
 *   - `close()`           Flush and close the underlying file handle.
 *
 * The lazy-evaluation contract is fully preserved: arguments wrapped in
 * `() => …` are only invoked when the corresponding level is enabled, and
 * disabled levels never touch the disk.
 */
export const createDedupLog = ({
  dir,
  level = 'info',
  now = () => new Date(),
  importDictionary,
  rotateOnDateChange = true,
  rotateOptions = {},
  globalDictionary = { enabled: true, minDays: 8, windowDays: 14 },
  format = isoFormat,
} = {}) => {
  if (!dir) {
    throw new Error('createDedupLog requires a "dir" option');
  }

  const sink = new FileSink({
    dir,
    now,
    onRotate: rotateOnDateChange
      ? (date) => {
          try {
            rotate({
              dir,
              date,
              importDictionary:
                importDictionary === undefined && globalDictionary?.enabled
                  ? './dictionary.log.lino'
                  : importDictionary,
              ...rotateOptions,
            });
            if (globalDictionary?.enabled) {
              buildGlobalDictionary({
                dir,
                minDays: globalDictionary.minDays ?? 8,
                windowDays: globalDictionary.windowDays ?? 14,
              });
            }
          } catch (err) {
            process.stderr.write(
              `dedup-log: post-rotation pipeline failed: ${err.message}\n`
            );
          }
        }
      : undefined,
  });

  const sinks = {};
  for (const name of LEVEL_NAMES) {
    sinks[name] = (...args) => sink.write(buildLine(name, args, now, format));
  }

  const log = makeLog({ level, log: sinks });

  log.close = () => sink.close();
  log.flush = () => sink.flush();
  log.sink = sink;
  log.dir = dir;
  log.dictionaryPath = dictionaryPath(dir);
  log.rotate = ({ date } = {}) => {
    const target = date ?? formatDate(new Date(now().getTime() - 86_400_000));
    return rotate({
      dir,
      date: target,
      importDictionary:
        importDictionary === undefined && globalDictionary?.enabled
          ? './dictionary.log.lino'
          : importDictionary,
      ...rotateOptions,
    });
  };
  log.buildGlobalDictionary = (options = {}) =>
    buildGlobalDictionary({
      dir,
      minDays: globalDictionary?.minDays ?? 8,
      windowDays: globalDictionary?.windowDays ?? 14,
      ...options,
    });

  return log;
};

export { levels };
