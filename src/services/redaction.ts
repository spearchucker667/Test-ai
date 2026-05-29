/** @fileoverview Redacts secrets, API keys, and bearer tokens from strings and objects. */

/** Pattern matching secret-related key names. */
const SECRET_KEY_PATTERN = /(authorization|api[-_ ]?key|token|secret|password)/i;

/** Pattern matching Bearer token strings. */
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

/** Pattern matching secret assignment expressions like apiKey="value". */
const ASSIGNMENT_PATTERN =
  /\b(api[-_ ]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s}]+/gi;

/** Pattern matching Venice API keys (vn-...). */
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;

/**
 * Redacts sensitive patterns from a single string.
 * @param value The raw string to sanitize.
 * @returns The redacted string.
 */
function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(VENICE_KEY_PATTERN, "[REDACTED]");
}

/**
 * Recursively redacts secrets from a value of any type.
 * @template T The type of the input value.
 * @param value The value to redact.
 * @returns A deep copy with secrets replaced by placeholders.
 */
export function redactSecrets<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactString(value) as T;
  if (!value || typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]" as T;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen)) as T;

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(entry, seen);
    }
  }
  return redacted as T;
}

/**
 * Redacts secrets from an error or unknown value, returning a safe message string.
 * @param value The error or value to process.
 * @returns A redacted string representation.
 */
export function redactErrorMessage(value: unknown): string {
  if (value instanceof Error) return redactString(value.message);
  return redactString(String(value || "Unknown error"));
}
