/**
 * dedup-log — lazy daily logger that deduplicates closed logs into the
 * Lino `.log.lino` format.
 *
 * Public surface:
 *   - createDedupLog({ dir, level, ... })  → log-lazy LogFunction with
 *     daily-file rotation and a Lino dedup pipeline.
 *   - rotate({ dir, date, ... })           → Run deduplino on one
 *     closed log and emit `<date>.log.lino`.
 *   - buildGlobalDictionary({ dir, ... })  → Promote frequent fragments
 *     into `<dir>/dictionary.log.lino` once enough history exists.
 *   - FileSink                             → Daily-rotating sink building
 *     block usable on its own.
 *   - splitDictionary, formatDictionary    → Lino dictionary helpers.
 *   - paths                                → Path layout helpers.
 */
export { createDedupLog, levels } from './logger.js';
export {
  rotate,
  buildGlobalDictionary,
  splitDictionary,
  formatDictionary,
} from './deduplicate-file.js';
export { FileSink } from './file-sink.js';
export {
  formatDate,
  parseDate,
  dayDiff,
  logPath,
  linoPath,
  dictionaryPath,
} from './paths.js';
