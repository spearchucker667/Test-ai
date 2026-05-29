/** @fileoverview Export and import logic for Venice Forge user data with validation and redaction. */

import { STORE_NAMES } from "../constants/venice";
import { redactSecrets } from "./redaction";
import { VENICE_MAX_BODY_BYTES } from "../shared/limits";

/** Current schema version for export payloads. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Maximum allowed size for an import JSON string in bytes. */
export const MAX_IMPORT_JSON_BYTES = VENICE_MAX_BODY_BYTES;

/** Ordered list of stores eligible for export and import. */
const EXPORT_STORES = ["images", "chats", "settings"] as const;

/** Per-field upper bounds to reject obviously malformed imports. */
const MAX_RECORD_ID_LENGTH = 256;
const MAX_TEXT_FIELD_CHARS = 100_000;
const MAX_IMAGE_FIELD_BYTES = 20 * 1024 * 1024;

/** Union type of exportable store names. */
type ExportStore = (typeof EXPORT_STORES)[number];

/** Shape of the data object inside an export payload. */
export interface ExportData {
  images: Record<string, unknown>[];
  chats: Record<string, unknown>[];
  settings: Record<string, unknown>[];
}

/** Top-level structure of a Venice Forge data export. */
export interface ExportPayload {
  version: number;
  exportedAt: string;
  appVersion: string;
  data: ExportData;
}

/** Summary of records discovered during import validation. */
export interface ImportSummary {
  imagesFound: number;
  chatsFound: number;
  settingsFound: number;
  skippedRecords: number;
}

/** Result of validating an import file, including the sanitized payload. */
export interface ValidatedImport {
  payload: ExportPayload;
  summary: ImportSummary;
}

/**
 * Computes the byte length of a UTF-8 string.
 * @param value The string to measure.
 * @returns The size in bytes.
 */
function byteLength(value: string): number {
  return new Blob([value]).size;
}

/**
 * Determines whether a value is a plain object (not an array, function, or null).
 * @param value The value to test.
 * @returns True if the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isShortString(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length <= maxChars;
}

/**
 * Sanitizes a single record for import, stripping secrets and ensuring required fields.
 * @param store The target store name.
 * @param value The raw record to sanitize.
 * @returns The cleaned record, or null if it is invalid.
 */
function sanitizeRecord(store: ExportStore, value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;

  const source = redactSecrets(value);
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (/api[-_ ]?key|authorization|password|secret|token/i.test(key)) continue;
    if (typeof entry === "function" || typeof entry === "symbol" || typeof entry === "undefined") continue;
    record[key] = entry;
  }

  if (typeof record.id !== "string" || record.id.trim().length === 0) {
    record.id = crypto.randomUUID();
  }
  if (!isShortString(record.id, MAX_RECORD_ID_LENGTH)) return null;

  if (!isFiniteTimestamp(record.timestamp)) {
    record.timestamp = Date.now();
  }

  if (store === "images") {
    if (typeof record.image !== "string") return null;
    if (byteLength(record.image) > MAX_IMAGE_FIELD_BYTES) return null;
    if (record.prompt !== undefined && !isShortString(record.prompt, MAX_TEXT_FIELD_CHARS)) return null;
    if (record.negative !== undefined && !isShortString(record.negative, MAX_TEXT_FIELD_CHARS)) return null;
  }

  if (store === "chats") {
    const hasPrompt = typeof record.prompt === "string";
    const hasResponse = typeof record.response === "string";
    if (!hasPrompt && !hasResponse) return null;
    if (hasPrompt && !isShortString(record.prompt, MAX_TEXT_FIELD_CHARS)) return null;
    if (hasResponse && !isShortString(record.response, MAX_TEXT_FIELD_CHARS)) return null;
  }

  if (store === "settings" && !isPlainObject(record.value)) return null;

  if (store === "settings") {
    record.value = sanitizeSettingsValue(record.value);
  }

  return record;
}

/**
 * Sanitizes a settings value object by stripping secret fields.
 * @param value The raw settings value.
 * @returns A cleaned plain object safe for persistence.
 */
function sanitizeSettingsValue(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(redactSecrets(value))) {
    if (/api[-_ ]?key|authorization|password|secret|token/i.test(key)) continue;
    if (typeof entry === "function" || typeof entry === "symbol" || typeof entry === "undefined") continue;
    sanitized[key] = entry;
  }
  return sanitized;
}

/**
 * Sanitizes an array of raw records for a given store.
 * @param store The target store name.
 * @param values The raw records to process.
 * @returns An object containing the valid records and a skip count.
 */
function sanitizeRecords(store: ExportStore, values: unknown[]): { records: Record<string, unknown>[]; skipped: number } {
  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const value of values) {
    const sanitized = sanitizeRecord(store, value);
    if (sanitized) records.push(sanitized);
    else skipped++;
  }
  return { records, skipped };
}

/**
 * Builds a validated export payload from partial store data.
 * @param data Partial export data containing zero or more store arrays.
 * @param appVersion The current application version string.
 * @returns A complete export payload with metadata and sanitized records.
 */
export function createExportPayload(data: Partial<ExportData>, appVersion: string): ExportPayload {
  const payloadData = EXPORT_STORES.reduce((acc, store) => {
    const records = Array.isArray(data[store]) ? data[store] : [];
    acc[store] = sanitizeRecords(store, records).records;
    return acc;
  }, {} as ExportData);

  return {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    data: payloadData,
  };
}

/**
 * Validates and sanitizes an import JSON string.
 * @param json The raw JSON string to validate.
 * @returns An object containing the validated payload and import summary.
 * @throws If the JSON is malformed, too large, or violates schema constraints.
 */
export function validateImportJson(json: string): ValidatedImport {
  if (byteLength(json) > MAX_IMPORT_JSON_BYTES) {
    throw new Error("Import JSON is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  if (!isPlainObject(parsed)) throw new Error("Import file must contain an object.");
  if (parsed.version !== EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported import version: ${String(parsed.version || "missing")}.`);
  }
  if (typeof parsed.exportedAt !== "string" || Number.isNaN(Date.parse(parsed.exportedAt))) {
    throw new Error("Import file is missing a valid exportedAt timestamp.");
  }
  if (typeof parsed.appVersion !== "string") {
    throw new Error("Import file is missing appVersion.");
  }
  if (!isPlainObject(parsed.data)) throw new Error("Import file is missing a data object.");

  const allowedStores = new Set<string>(EXPORT_STORES);
  for (const store of Object.keys(parsed.data)) {
    if (!allowedStores.has(store)) throw new Error(`Import contains unexpected store: ${store}.`);
    if (!STORE_NAMES.includes(store)) throw new Error(`Import contains unsupported store: ${store}.`);
  }

  const payloadData = {} as ExportData;
  let skippedRecords = 0;
  for (const store of EXPORT_STORES) {
    const rawRecords = (parsed.data as Record<string, unknown>)[store];
    if (rawRecords === undefined) {
      payloadData[store] = [];
      continue;
    }
    if (!Array.isArray(rawRecords)) throw new Error(`Import store ${store} must be an array.`);
    const { records, skipped } = sanitizeRecords(store, rawRecords);
    payloadData[store] = records;
    skippedRecords += skipped;
  }

  const payload: ExportPayload = {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: parsed.exportedAt,
    appVersion: parsed.appVersion,
    data: payloadData,
  };

  return {
    payload,
    summary: {
      imagesFound: payloadData.images.length,
      chatsFound: payloadData.chats.length,
      settingsFound: payloadData.settings.length,
      skippedRecords,
    },
  };
}
