// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Shared endpoint allowlist consumed by both Electron IPC and the web proxy. */

/** Venice API endpoints permitted by the IPC and proxy validators. */
export const ALLOWED_VENICE_ENDPOINTS = [
  "/models",
  "/chat/completions",
  "/image/generate",
  "/image/upscale",
  "/augment/search",
  "/augment/scrape",
  "/augment/text-parser",
] as const;

/** HTTP methods permitted for Venice API requests. */
export const ALLOWED_VENICE_METHODS = ["GET", "POST"] as const;

/** Union type of allowed Venice API endpoint paths. */
export type VeniceIpcEndpoint = (typeof ALLOWED_VENICE_ENDPOINTS)[number];

/** Union type of allowed Venice API HTTP methods. */
export type VeniceIpcMethod = (typeof ALLOWED_VENICE_METHODS)[number];

/** Allowed HTTP methods for each permitted Venice endpoint. */
export const VENICE_ENDPOINT_METHODS: Record<VeniceIpcEndpoint, readonly VeniceIpcMethod[]> = {
  "/models": ["GET"],
  "/chat/completions": ["POST"],
  "/image/generate": ["POST"],
  "/image/upscale": ["POST"],
  "/augment/search": ["POST"],
  "/augment/scrape": ["POST"],
  "/augment/text-parser": ["POST"],
};

/**
 * Checks whether an HTTP method is valid for an allowed Venice endpoint.
 * @param endpoint The parsed Venice endpoint pathname.
 * @param method The normalized HTTP method.
 * @returns True when the endpoint/method pair is allowed.
 */
export function isAllowedVeniceRequest(endpoint: string, method: string): boolean {
  const allowedMethods = VENICE_ENDPOINT_METHODS[endpoint as VeniceIpcEndpoint];
  return !!allowedMethods?.includes(method as VeniceIpcMethod);
}
