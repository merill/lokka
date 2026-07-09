import { appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function resolveLogFile() {
    try {
        return join(import.meta.dirname, "mcp-server.log");
    }
    catch {
        return join(tmpdir(), "lokka-mcp-server.log");
    }
}
const LOG_FILE = resolveLogFile();
function formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const dataStr = data
        ? `\n${JSON.stringify(data, null, 2)}`
        : "";
    return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}
export const logger = {
    info(message, data) {
        const logMessage = formatMessage("INFO", message, data);
        process.stderr.write(logMessage);
        try {
            appendFileSync(LOG_FILE, logMessage);
        }
        catch {
            // Logging must never crash the server (e.g. read-only install directory).
        }
    },
    error(message, error) {
        const logMessage = formatMessage("ERROR", message, error);
        process.stderr.write(logMessage);
        try {
            appendFileSync(LOG_FILE, logMessage);
        }
        catch {
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
