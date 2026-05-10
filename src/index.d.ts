/**
 * dedup-log — type definitions
 */
import type { LogFunction, LogOptions } from 'log-lazy';

export interface CreateDedupLogOptions {
  /** Directory under which `<date>.log` and `<date>.log.lino` are written. */
  dir: string;
  /** log-lazy level name or bitmask. Defaults to `'info'`. */
  level?: LogOptions['level'];
  /** Clock injection point; defaults to `() => new Date()`. */
  now?: () => Date;
  /** Override the `(import dictionary "...")` header. Set `null` to omit. */
  importDictionary?: string | null;
  /** Trigger deduplication automatically when the UTC date rolls over. */
  rotateOnDateChange?: boolean;
  /** Options passed through to `rotate()`. */
  rotateOptions?: Omit<RotateOptions, 'dir' | 'date'>;
  /** Global dictionary builder configuration. */
  globalDictionary?: {
    enabled?: boolean;
    minDays?: number;
    windowDays?: number;
  };
  /** Override the timestamp formatter used in the on-disk log line. */
  format?: (date: Date) => string;
}

export interface RotateOptions {
  dir: string;
  date: string | Date;
  threshold?: number;
  autoEscape?: boolean;
  removeRaw?: boolean;
  importDictionary?: string | null;
}

export interface RotateResult {
  date: string;
  sourcePath: string;
  targetPath: string;
  success: boolean;
  reason?: string;
  patternsApplied: number;
  dictionary?: Map<string, string>;
  importDictionary?: string | null;
}

export interface BuildGlobalDictionaryOptions {
  dir: string;
  minDays?: number;
  windowDays?: number;
  threshold?: number;
  autoEscape?: boolean;
}

export interface BuildGlobalDictionaryResult {
  built: boolean;
  reason?: string;
  path: string;
  patterns: number;
  days: number;
  coveredDates?: string[];
}

export interface DedupLogger extends LogFunction {
  /** Force-rotate the given date (default: yesterday in UTC). */
  rotate(options?: { date?: string | Date }): RotateResult;
  /** Build/refresh the global dictionary if enough history exists. */
  buildGlobalDictionary(
    options?: Partial<BuildGlobalDictionaryOptions>
  ): BuildGlobalDictionaryResult;
  /** Path where the global dictionary will be written. */
  dictionaryPath: string;
  /** Logs directory. */
  dir: string;
  /** Close the underlying file sink. */
  close(): void;
  /** No-op (writes are synchronous); kept for API parity. */
  flush(): void;
}

export declare function createDedupLog(
  options: CreateDedupLogOptions
): DedupLogger;
export declare function rotate(options: RotateOptions): RotateResult;
export declare function buildGlobalDictionary(
  options: BuildGlobalDictionaryOptions
): BuildGlobalDictionaryResult;
export declare function splitDictionary(output: string): {
  dictionary: Map<string, string>;
  body: string;
};
export declare function formatDictionary(
  dictionary: Map<string, string>
): string;

export declare class FileSink {
  constructor(options: {
    dir: string;
    now?: () => Date;
    onRotate?: (date: string) => void;
  });
  write(line: string): void;
  close(): void;
  flush(): void;
}

export declare function formatDate(date: Date): string;
export declare function parseDate(str: string): Date;
export declare function dayDiff(a: Date, b: Date): number;
export declare function logPath(dir: string, date: Date): string;
export declare function linoPath(dir: string, date: Date): string;
export declare function dictionaryPath(dir: string): string;

export { levels } from 'log-lazy';
