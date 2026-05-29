/** @fileoverview Global application reducer and state helpers for Venice Forge. */

import { FALLBACK_MODELS, DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { produce } from "immer";
import { warn } from "../shared/logger";
import type { AppAction } from "../types/app";

/**
 * Determines the model category from its metadata.
 *
 * @param model Raw model object from the API.
 * @returns The inferred category, e.g. "text", "image", or "unknown".
 */
function classifyModel(model: any) {
  const id = String(model.id || model.model || "").toLowerCase();
  const type = String(
    model.type || model.model_type || model.modelType || ""
  ).toLowerCase();
  const traits = JSON.stringify(
    model.traits || model.capabilities || model.features || {}
  ).toLowerCase();

  if (["text", "llm", "chat", "code"].includes(type)) return "text";
  if (["image", "inpaint", "upscale"].includes(type)) return "image";
  if (["tts", "asr", "audio", "music"].includes(type)) return "audio";
  if (type === "video") return "video";
  if (["embedding", "embeddings"].includes(type)) return "embeddings";

  if (/embed/.test(id + traits)) return "embeddings";
  if (/image|sdxl|flux|fluently|lustify|pony|stable|diffusion|inpaint|upscale|banana/.test(id + traits))
    return "image";
  if (/audio|voice|speech|tts|asr|transcri|music/.test(id + traits)) return "audio";
  if (/video|wan|motion|animate/.test(id + traits)) return "video";
  if (/llama|qwen|deepseek|mistral|grok|dolphin|venice|chat|text|coder|reason|zai|glm|kimi|gemma|gemini|hermes|openai/.test(id + traits))
    return "text";
  return "unknown";
}

/**
 * Normalizes a raw model list into grouped categories.
 *
 * @param payload Raw API response or array of models.
 * @returns Record mapping categories to arrays of normalized models.
 */
export function flattenModels(payload: any) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
    ? payload
    : [];
  const groups: Record<string, any[]> = {
    text: [],
    image: [],
    audio: [],
    video: [],
    embeddings: [],
    unknown: [],
  };
  list.forEach((m: any) => {
    const normalized = {
      ...m,
      id: m.id || m.model || m.name || "unknown-model",
      name: m.name || m.display_name || m.id || m.model || "unknown model",
      type: m.type || m.model_type || m.modelType || classifyModel(m),
      isFallback: false,
      source: "live" as const,
    };
    groups[classifyModel(normalized)].push(normalized);
  });
  return groups;
}

/**
 * Injects fallback models into empty category groups.
 *
 * @param groups Model groups from flattenModels.
 * @returns A new groups object with fallback models where needed.
 */
export function withFallbackModels(groups: Record<string, any[]>) {
  const next: Record<string, any[]> = {
    text: [],
    image: [],
    audio: [],
    video: [],
    embeddings: [],
    unknown: [],
    ...groups,
  };
  if (!next.text.length) next.text = FALLBACK_MODELS.text;
  if (!next.image.length) next.image = FALLBACK_MODELS.image;
  return next;
}

/**
 * Coerces a web search setting to a canonical value.
 *
 * @param value Raw setting value, which may be a boolean or string.
 * @returns The normalized setting: "off", "on", or "auto".
 */
function normalizeWebSearchSetting(value: unknown): "off" | "on" | "auto" {
  if (value === true) return "on";
  if (value === false) return "off";
  if (value === "off" || value === "on" || value === "auto") return value;
  warn("normalizeWebSearchSetting: invalid value, defaulting to off", value);
  return "off";
}

/** Initial application state used to bootstrap the store. */
export const initialState = {
  activeTab: "chat",
  models: withFallbackModels({}) as Record<string, import("../types/venice").ModelInfo[]>,
  usingFallbackModels: true,
  selectedChatModel: "venice-uncensored",
  selectedImageModel: "flux-dev",
  settings: {
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    includeVeniceSystemPrompt: true,
    webSearch: "off",
    webScraping: false,
    webCitations: false,
    theme: "dark" as const,
    customModels: [] as string[],
  },
  diagnostics: null as any,
  diagnosticsLog: [] as any[],
  gallery: [] as any[],
  chats: [] as any[],
  sourcePanelOpen: true,
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  modelLoadError: "",
  imageDraft: {
    prompt: "",
    negative: "",
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
    steps: 24,
    cfg: 7.5,
    style: "",
    safeMode: false,
    currentImage: "",
    lastSavedImageId: null,
    imageCount: 1,
    currentImages: [] as any[],
    currentBatchId: null as string | null,
    generationProgress: "",
    batchQueueStatus: "",
    disableWatermark: true,
  },
  batchDraft: {
    type: "text", // 'text' or 'image'
    promptsText:
      "Explain quantum computing in one sentence.\nWrite a haiku about a robot.\nWhat is the capital of France?",
  },
  chatDraft: {
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    messages: [] as import("../types/app").ChatRecord[],
  },
  toasts: [] as import("../types/app").ToastMessage[],
};

/**
 * Applies an action to the application state.
 *
 * @param state The current immutable state.
 * @param action The dispatched action.
 * @returns The next immutable state.
 */
export const appReducer = produce((draft: typeof initialState, action: AppAction) => {
  switch (action.type) {
    case "SET_TAB":
      draft.activeTab = action.tab;
      break;
    case "SET_MODELS": {
      const models = withFallbackModels(action.models || {});
      draft.models = models;
      draft.usingFallbackModels = !!action.fallback;

      const chatModelExists = models.text.some((m: any) => m.id === draft.selectedChatModel);
      const imageModelExists = models.image.some((m: any) => m.id === draft.selectedImageModel);

      if (!chatModelExists) {
        const firstLive = models.text.find((m: any) => m.source === "live");
        const fallback = models.text[0];
        draft.selectedChatModel = firstLive?.id || fallback?.id || "venice-uncensored";
        if (draft.selectedChatModel) {
          draft.toasts.push({
            id: crypto.randomUUID(),
            message: `Previous chat model was unavailable. Switched to ${draft.selectedChatModel}.`,
            type: "warn",
            duration: 6000,
          });
        }
      }

      if (!imageModelExists) {
        const firstLive = models.image.find((m: any) => m.source === "live");
        const fallback = models.image[0];
        draft.selectedImageModel = firstLive?.id || fallback?.id || "flux-dev";
        if (draft.selectedImageModel) {
          draft.toasts.push({
            id: crypto.randomUUID(),
            message: `Previous image model was unavailable. Switched to ${draft.selectedImageModel}.`,
            type: "warn",
            duration: 6000,
          });
        }
      }

      draft.modelLoadError = action.error || "";
      break;
    }
    case "SET_SELECTED_CHAT_MODEL":
      draft.selectedChatModel = action.model;
      break;
    case "SET_SELECTED_IMAGE_MODEL":
      draft.selectedImageModel = action.model;
      break;
    case "SET_SETTINGS": {
      // Defensive: ignore non-object payloads that could crash the `in` operator.
      if (!action.settings || typeof action.settings !== "object" || Array.isArray(action.settings)) break;
      // Explicit property whitelist to prevent prototype pollution.
      const allowedKeys: (keyof typeof draft.settings)[] = [
        "defaultSystemPrompt", "includeVeniceSystemPrompt", "webSearch", "webScraping", "webCitations", "theme", "customModels",
      ];
      for (const key of allowedKeys) {
        if (key in action.settings) {
          const nextValue = (action.settings as any)[key];
          if (key === "defaultSystemPrompt") {
            if (typeof nextValue === "string") draft.settings.defaultSystemPrompt = nextValue;
            continue;
          }
          if (key === "includeVeniceSystemPrompt") {
            if (typeof nextValue === "boolean") draft.settings.includeVeniceSystemPrompt = nextValue;
            continue;
          }
          if (key === "webSearch") {
            draft.settings.webSearch = normalizeWebSearchSetting(nextValue);
            continue;
          }
          if (key === "webScraping") {
            if (typeof nextValue === "boolean") draft.settings.webScraping = nextValue;
            continue;
          }
          if (key === "webCitations") {
            if (typeof nextValue === "boolean") draft.settings.webCitations = nextValue;
            continue;
          }
          if (key === "theme") {
            if (nextValue === "dark" || nextValue === "light" || nextValue === "system") {
              draft.settings.theme = nextValue;
            }
            continue;
          }
          if (key === "customModels") {
            if (Array.isArray(nextValue)) {
              draft.settings.customModels = nextValue.filter((m: unknown): m is string => typeof m === "string");
            }
            continue;
          }
        }
      }
      break;
    }
    case "SET_DIAGNOSTICS": {
      const entry = {
        ...action.diagnostics,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      draft.diagnostics = entry;
      draft.diagnosticsLog.unshift(entry);
      if (draft.diagnosticsLog.length > 50) {
        draft.diagnosticsLog.pop();
      }
      break;
    }
    case "SET_GALLERY":
      draft.gallery = action.items || [];
      break;
    case "SET_CHATS":
      draft.chats = action.items || [];
      break;
    case "TOGGLE_SOURCE_PANEL":
      draft.sourcePanelOpen = !draft.sourcePanelOpen;
      break;
    case "SET_CHAT_DRAFT":
      if (action.patch && typeof action.patch === "object") {
        Object.assign(draft.chatDraft, action.patch);
      }
      break;
    case "SET_IMAGE_DRAFT":
      if (action.patch && typeof action.patch === "object") {
        Object.assign(draft.imageDraft, action.patch);
      }
      break;
    case "SET_BATCH_DRAFT":
      if (action.patch && typeof action.patch === "object") {
        Object.assign(draft.batchDraft, action.patch);
      }
      break;
    case "SET_ONLINE":
      draft.isOnline = action.online;
      break;
    case "ADD_TOAST":
      draft.toasts.push(action.toast);
      break;
    case "REMOVE_TOAST":
      draft.toasts = draft.toasts.filter((t) => t.id !== action.id);
      break;
  }
});
