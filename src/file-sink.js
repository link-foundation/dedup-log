import fs from 'node:fs';
import path from 'node:path';
import { formatDate, logPath } from './paths.js';

/**
 * Append-only daily log writer. Keeps one open file handle for the active
 * UTC date and rotates lazily on the first write of a new day.
 *
 * The sink is intentionally synchronous: log-lazy invokes the underlying
 * sink callbacks synchronously once a level passes, so the on-disk write
 * has to be synchronous as well to preserve ordering across processes.
 */
export class FileSink {
  constructor({ dir, now = () => new Date(), onRotate } = {}) {
    if (!dir) {
      throw new Error('FileSink requires a "dir" option');
    }
    this.dir = dir;
    this.now = now;
    this.onRotate = onRotate;
    fs.mkdirSync(dir, { recursive: true });
    this._fd = null;
    this._activeDate = null;
  }

  _ensureFile(date) {
    const stamp = formatDate(date);
    if (this._activeDate === stamp && this._fd !== null) {
      return;
    }
    if (this._fd !== null) {
      fs.closeSync(this._fd);
      const previous = this._activeDate;
      this._fd = null;
      this._activeDate = null;
      if (this.onRotate && previous) {
        try {
          this.onRotate(previous);
        } catch (err) {
          process.stderr.write(
            `dedup-log: rotation hook failed for ${previous}: ${err.message}\n`
          );
        }
      }
    }
    const file = logPath(this.dir, date);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this._fd = fs.openSync(file, 'a');
    this._activeDate = stamp;
  }

  write(line) {
    this._ensureFile(this.now());
    const payload = line.endsWith('\n') ? line : `${line}\n`;
    fs.writeSync(this._fd, payload);
  }

  close() {
    if (this._fd !== null) {
      fs.closeSync(this._fd);
      this._fd = null;
      this._activeDate = null;
    }
  }

  /** Flush is implicit because we use synchronous writes; provided for API parity. */
  flush() {}
}
