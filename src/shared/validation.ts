export const ALLOWED_VENICE_ENDPOINTS = [
  "/models",
  "/chat/completions",
  "/image/generate",
  "/image/upscale",
  "/augment/search",
  "/augment/scrape",
  "/augment/text-parser",
] as const;

export const ALLOWED_VENICE_METHODS = ["GET", "POST"] as const;

export type VeniceIpcEndpoint = (typeof ALLOWED_VENICE_ENDPOINTS)[number];
export type VeniceIpcMethod = (typeof ALLOWED_VENICE_METHODS)[number];
