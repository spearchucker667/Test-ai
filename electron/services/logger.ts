/** @fileoverview Provides rotated file logging with automatic secret redaction
 *  for the Electron main process. */

import { app, shell } from "electron";
import fs from "fs";
import path from "path";

/** Name of the log file written to the user data directory. */
const LOG_FILE = "venice-forge.log";

/** Maximum size in bytes before rotating the log file. */
const MAX_LOG_BYTES = 1024 * 1024;

/** Holds the most recent API error message for diagnostics display. */
let lastApiError = "";

/** Redacts secrets, tokens, and API keys from a log value.
 *  @param value The raw value to sanitize.
 *  @returns A redacted string safe for logging.
 */
function redact(value: unknown): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=[REDACTED]")
    .replace(/\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi, "[REDACTED]");
}

/** Returns the directory path where log files are stored. */
export function getLogsDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

/** Returns the full path to the current log file. */
export function getLogPath(): string {
  return path.join(getLogsDir(), LOG_FILE);
}

/** @internal exported for testing */
export function ensureLogFile(): void {
  fs.mkdirSync(getLogsDir(), { recursive: true });
  const logPath = getLogPath();
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
    const b3 = `${logPath}.3`;
    const b2 = `${logPath}.2`;
    const b1 = `${logPath}.1`;
    if (fs.existsSync(b2)) {
      fs.renameSync(b2, b3);
    }
    if (fs.existsSync(b1)) {
      fs.renameSync(b1, b2);
    }
    fs.renameSync(logPath, b1);
  }
}

/** Writes an informational message to the log file.
 *  @param message The log message.
 *  @param meta Optional metadata to include.
 */
export function logInfo(message: string, meta?: unknown): void {
  writeLog("INFO", message, meta);
}

/** Writes an error message to the log file.
 *  @param message The log message.
 *  @param error Optional error object or message.
 */
export function logError(message: string, error?: unknown): void {
  const normalized = error instanceof Error ? `${error.name}: ${error.message}` : error;
  writeLog("ERROR", message, normalized);
}

/** Writes a log line at the specified level with optional metadata.
 *  @param level The severity level.
 *  @param message The log message.
 *  @param meta Optional metadata to append.
 */
function writeLog(level: "INFO" | "ERROR", message: string, meta?: unknown): void {
  try {
    ensureLogFile();
    const metaText = meta === undefined ? "" : ` ${redact(typeof meta === "string" ? meta : JSON.stringify(meta))}`;
    fs.appendFileSync(getLogPath(), `${new Date().toISOString()} ${level} ${redact(message)}${metaText}\n`, "utf-8");
  } catch {
    // Logging must never break app startup or API requests.
  }
}

/** Stores the last API error after redacting sensitive content.
 *  @param error The error to record.
 */
export function setLastApiError(error: unknown): void {
  lastApiError = redact(error instanceof Error ? error.message : String(error || ""));
}

/** Retrieves the last stored API error message. */
export function getLastApiError(): string {
  return lastApiError;
}

/** Opens the log folder in the system file manager.
 *  @returns An object indicating success and the folder path.
 */
export async function openLogsFolder(): Promise<{ ok: boolean; path: string }> {
  ensureLogFile();
  await shell.openPath(getLogsDir());
  return { ok: true, path: getLogsDir() };
}
