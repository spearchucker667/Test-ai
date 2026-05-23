/** @fileoverview Validates IPC requests from the renderer to ensure they target
 *  allowed Venice endpoints, methods, and payload sizes. */

// Code Owner: fayeblade (@spearchucker667)
// IPC input validation — critical security boundary between renderer and main process.
export const MAX_VENICE_IPC_BODY_BYTES = 25 * 1024 * 1024;

import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  VeniceIpcEndpoint,
  VeniceIpcMethod,
  isAllowedVeniceRequest,
} from "../../src/shared/validation";
import { VENICE_API_HOST } from "../../src/shared/apiConfig";

/** Describes a validated Venice IPC request ready for the main process. */
export interface VeniceIpcRequest {
  endpoint: string;
  method: VeniceIpcMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
}

/** Computes the UTF-8 byte length of a request body. */
function bodySizeBytes(body: unknown): number {
  if (body === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(body), "utf-8");
}

/** Parses and validates that a Venice endpoint is relative and on the allowed origin.
 *  @param endpoint The raw endpoint string from the renderer.
 *  @returns A parsed URL constrained to the Venice API host.
 */
function parseEndpoint(endpoint: string): URL {
  if (!endpoint.startsWith("/")) throw new Error("Venice endpoint must be relative.");
  let parsed: URL;
  try {
    parsed = new URL(endpoint, `https://${VENICE_API_HOST}`);
  } catch {
    throw new Error("Venice endpoint is malformed.");
  }
  if (parsed.origin !== `https://${VENICE_API_HOST}`) {
    throw new Error("Venice endpoint must stay on the Venice API origin.");
  }
  return parsed;
}

/** Validates that a user-provided API key is a non-empty string within length limits.
 *  @param key The raw API key value to validate.
 *  @returns The trimmed API key string.
 */
export function validateApiKeyInput(key: unknown): string {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Enter a Venice API key before saving.");
  }
  const trimmed = key.trim();
  if (trimmed.length > 512) throw new Error("Venice API key is too long.");
  return trimmed;
}

/** Validates and sanitizes a Venice IPC request from the renderer.
 *  @param input The raw request payload from IPC.
 *  @returns A validated and sanitized request object.
 */
export function validateVeniceIpcRequest(input: unknown): VeniceIpcRequest {
  if (!input || typeof input !== "object") throw new Error("Venice request must be an object.");
  const request = input as Record<string, unknown>;
  if (typeof request.endpoint !== "string") throw new Error("Venice endpoint must be a string.");
  const endpoint = parseEndpoint(request.endpoint);
  if (!ALLOWED_VENICE_ENDPOINTS.includes(endpoint.pathname as VeniceIpcEndpoint)) {
    throw new Error(`Venice endpoint ${endpoint.pathname} is not allowed.`);
  }

  const method = typeof request.method === "string" ? request.method.toUpperCase() : "";
  if (!ALLOWED_VENICE_METHODS.includes(method as VeniceIpcMethod)) {
    throw new Error(`Venice method ${method || "missing"} is not allowed.`);
  }
  if (!isAllowedVeniceRequest(endpoint.pathname, method)) {
    throw new Error(`Venice method ${method} is not allowed for endpoint ${endpoint.pathname}.`);
  }
  if (method === "GET" && request.body !== undefined) {
    throw new Error("GET Venice requests cannot include a body.");
  }

  const size = bodySizeBytes(request.body);
  if (size > MAX_VENICE_IPC_BODY_BYTES) {
    throw new Error("Venice request payload is too large.");
  }

  const headers: Record<string, string> = {};
  if (request.headers !== undefined) {
    if (!request.headers || typeof request.headers !== "object" || Array.isArray(request.headers)) {
      throw new Error("Venice request headers must be an object.");
    }
    for (const [key, value] of Object.entries(request.headers as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (lower === "authorization" || lower === "host" || lower === "cookie") continue;
      if (typeof value === "string" && value.length <= 512) headers[key] = value;
    }
  }

  if (request.signalId !== undefined && typeof request.signalId !== "string") {
    throw new Error("Venice signalId must be a string.");
  }

  return {
    endpoint: `${endpoint.pathname}${endpoint.search}`,
    method: method as VeniceIpcMethod,
    body: request.body,
    headers,
    signalId: request.signalId,
  };
}
