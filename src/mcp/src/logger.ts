import { appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function resolveLogFile(): string {
  try {
    return join(import.meta.dirname, "mcp-server.log");
  } catch {
    return join(tmpdir(), "lokka-mcp-server.log");
  }
}

const LOG_FILE = resolveLogFile();

function formatMessage(
  level: string,
  message: string,
  data?: unknown,
): string {
  const timestamp = new Date().toISOString();
  let dataStr = "";
  if (data !== undefined) {
    try {
      const serializable = data instanceof Error
        ? { name: data.name, message: data.message, stack: data.stack }
        : data;
      dataStr = `\n${JSON.stringify(serializable, null, 2)}`;
    } catch {
      dataStr = "\n[unserializable data]";
    }
  }
  return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}

export const logger = {
  info(message: string, data?: unknown) {
    const logMessage = formatMessage(
      "INFO",
      message,
      data,
    );
    process.stderr.write(logMessage);
    try {
      appendFileSync(LOG_FILE, logMessage);
    } catch {
      // Logging must never crash the server (e.g. read-only install directory).
    }
  },

  error(message: string, error?: unknown) {
    const logMessage = formatMessage(
      "ERROR",
      message,
      error,
    );
    process.stderr.write(logMessage);
    try {
      appendFileSync(LOG_FILE, logMessage);
    } catch {
      // Logging must never crash the server (e.g. read-only install directory).
    }
  },

  // debug(message: string, data?: unknown) {
  //   const logMessage = formatMessage(
  //     "DEBUG",
  //     message,
  //     data,
  //   );
  //   appendFileSync(LOG_FILE, logMessage);
  // },
};