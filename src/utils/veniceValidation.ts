/**
 * @fileoverview Runtime validators for Venice API response shapes.
 *
 * These guards are intentionally non-throwing: they return a normalised result
 * (or null/empty) and emit a warning so callers can decide whether to
 * surface an error to the user or fall back gracefully.
 */

import { warn } from "../shared/logger";

/** Represents a successful /models response. */
export interface ModelListResponse {
  data: unknown[];
}

/** Represents a successful /image/generate or /image/upscale response. */
export interface ImageGenerateResponse {
  images?: string[];
  data?: unknown[];
}

/** Represents a successful /chat/completions response. */
export interface ChatCompletionsResponse {
  choices: Array<{
    message?: { content?: string };
    delta?: { content?: string };
    text?: string;
  }>;
}

/**
 * Validates that a /models response contains a usable model list.
 *
 * @param payload The raw response payload to validate.
 * @returns True when the payload contains a model list.
 */
export function isValidModelListResponse(payload: unknown): payload is ModelListResponse {
  if (!payload || typeof payload !== "object") {
    warn("[veniceValidation] /models response is not an object", payload);
    return false;
  }
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.data)) {
    // Some Venice API variants return a bare array; tolerate that too.
    if (Array.isArray(payload)) return true;
    warn("[veniceValidation] /models response missing .data array", payload);
    return false;
  }
  return true;
}

/**
 * Validates that an /image/generate or /image/upscale response contains image data.
 *
 * @param payload The raw response payload to validate.
 * @returns True when the payload has at least one recognisable image field.
 */
export function isValidImageResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    warn("[veniceValidation] Image response is not an object", payload);
    return false;
  }
  const p = payload as Record<string, unknown>;
  const hasImages =
    (Array.isArray(p.images) && p.images.length > 0) ||
    (Array.isArray(p.data) && p.data.length > 0) ||
    typeof p.image === "string" ||
    typeof p.b64_json === "string" ||
    typeof p.base64 === "string" ||
    typeof p.url === "string" ||
    typeof p.dataUrl === "string" ||     // web: binary PNG returned as data URL
    typeof p.dataBase64 === "string";    // Electron: binary PNG serialized to base64
  if (!hasImages) {
    warn("[veniceValidation] Image response contains no recognisable image data", payload);
  }
  return hasImages;
}

/**
 * Validates that a non-streaming /chat/completions response has choices.
 *
 * @param payload The raw response payload to validate.
 * @returns True when the payload contains a choices array.
 */
export function isValidChatResponse(payload: unknown): payload is ChatCompletionsResponse {
  if (!payload || typeof payload !== "object") {
    warn("[veniceValidation] Chat response is not an object", payload);
    return false;
  }
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.choices) || p.choices.length === 0) {
    warn("[veniceValidation] Chat response missing .choices array", payload);
    return false;
  }
  return true;
}

/**
 * Validates that a /augment/search response contains a results array.
 *
 * @param payload The raw response payload to validate.
 * @returns True when the payload contains a recognisable results field.
 */
export function isValidSearchResponse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    warn("[veniceValidation] Search response is not an object", payload);
    return false;
  }
  const p = payload as Record<string, unknown>;
  const hasResults =
    Array.isArray(p.results) ||
    Array.isArray(p.data) ||
    Array.isArray(p.items) ||
    Array.isArray(payload);
  if (!hasResults) {
    warn("[veniceValidation] Search response contains no recognisable results field", payload);
  }
  return hasResults;
}
