export const FALLBACK_MODELS = {
  text: [
    { id: "venice-uncensored", type: "text", name: "venice-uncensored", traits: ["fallback"] },
    { id: "llama-3.3-70b", type: "text", name: "llama-3.3-70b", traits: ["fallback"] }
  ],
  image: [
    { id: "fluently-xl", type: "image", name: "fluently-xl", traits: ["fallback"] },
    { id: "lustify-sdxl", type: "image", name: "lustify-sdxl", traits: ["fallback"] }
  ],
  audio: [],
  video: [],
  embeddings: [],
  unknown: []
};

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
  "x-venice-is-blurred"
];

export const DEFAULT_SYSTEM_PROMPT = "You are a precise, useful AI assistant inside a browser-only Venice API studio prototype.";

export const STORE_NAMES = ["images", "chats", "settings", "diagnostics"];
export const DB_NAME = "venice_canvas_studio_v1";
export const DB_VERSION = 1;
