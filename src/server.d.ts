/**
 * dedup-log/server — type definitions
 */
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type { LogOptions } from 'log-lazy';
import type { DedupLogger } from './index.js';

export interface StartServerOptions {
  dir: string;
  host?: string;
  port?: number;
  level?: LogOptions['level'];
  log?: DedupLogger;
}

export function startServer(options: StartServerOptions): Server;
export function createHandler(options: {
  dir: string;
  log: DedupLogger;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
