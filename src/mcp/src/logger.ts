import { appendFileSync } from "fs";

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE;

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? 1;

function log(level: string, message: string, data?: unknown): void {
  if ((LEVELS[level] ?? 0) < currentLevel) return;
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;
  process.stdout.write(line);
  if (LOG_FILE) {
    appendFileSync(LOG_FILE, line);
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info:  (message: string, data?: unknown) => log('info',  message, data),
  warn:  (message: string, data?: unknown) => log('warn',  message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
};
