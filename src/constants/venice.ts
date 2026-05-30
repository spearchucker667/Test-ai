/** @fileoverview Application constants for fallback models, tabs, diagnostics headers, and database configuration. */

/** Default models used when the Venice API model list is unavailable. */
export const FALLBACK_MODELS = {
  text: [
    { id: "venice-uncensored", type: "text", name: "venice-uncensored", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "venice-uncensored-1-2", type: "text", name: "venice-uncensored-1-2", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "llama-3.3-70b", type: "text", name: "llama-3.3-70b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "llama-3.2-3b", type: "text", name: "llama-3.2-3b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "zai-org-glm-5.1", type: "text", name: "zai-org-glm-5.1", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "zai-org-glm-4.7", type: "text", name: "zai-org-glm-4.7", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "mistral-31-24b", type: "text", name: "mistral-31-24b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "qwen3-4b", type: "text", name: "qwen3-4b", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "deepseek-ai-DeepSeek-R1", type: "text", name: "deepseek-ai-DeepSeek-R1", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  image: [
    { id: "flux-dev", type: "image", name: "flux-dev", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "lustify-sdxl", type: "image", name: "lustify-sdxl", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "z-image-turbo", type: "image", name: "z-image-turbo", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "nano-banana-pro", type: "image", name: "nano-banana-pro", traits: ["fallback"], isFallback: true, source: "fallback" },
    { id: "venice-sd35", type: "image", name: "venice-sd35", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  audio: [
    { id: "tts-kokoro", type: "audio", name: "tts-kokoro", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  video: [],
  embeddings: [
    { id: "text-embedding-bge-m3", type: "embeddings", name: "text-embedding-bge-m3", traits: ["fallback"], isFallback: true, source: "fallback" }
  ],
  unknown: []
};

/** Ordered list of application tabs with their display labels. */
export const TABS = [
  ["chat", "Prompt"],
  ["image", "Create"],
  ["batch", "Batch"],
  ["search", "Research"],
  ["models", "Catalog"],
  ["gallery", "Library"],
  ["settings", "Config"],
  ["diagnostics", "Status"]
];

/** Response header names captured for diagnostics. */
export const DIAG_HEADER_NAMES = [
  "CF-RAY",
  "x-venice-version",
  "x-venice-timestamp",
  "x-venice-model-id",
  "x-venice-model-name",
  "x-venice-model-router",
  "x-venice-model-deprecation-warning",
  "x-venice-model-deprecation-date",
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-tokens",
  "x-ratelimit-type",
  "x-venice-balance-usd",
  "x-venice-balance-diem",
  "x-venice-is-content-violation",
  "x-venice-is-blurred",
  "x-venice-contains-minor",
  "x-venice-is-adult-model-content-violation"
];

/** Default system prompt applied to new chat conversations. */
export const DEFAULT_SYSTEM_PROMPT = "You are a precise, useful AI assistant inside Venice Forge.";

/** IndexedDB object store names used by the application. */
export const STORE_NAMES = ["images", "chats", "settings", "diagnostics", "conversations"];

/** Name of the IndexedDB database. */
export const DB_NAME = "venice_canvas_studio_v1";

/** Version of the IndexedDB schema. */
export const DB_VERSION = 2;

/** Delay between batched image generation requests to avoid rate limits. */
export const IMAGE_BATCH_INTER_REQUEST_DELAY_MS = 750;
