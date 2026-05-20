import { FALLBACK_MODELS, DEFAULT_SYSTEM_PROMPT } from "../constants/venice";

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
  if (/image|sdxl|flux|fluently|lustify|pony|stable|diffusion|inpaint|upscale/.test(id + traits))
    return "image";
  if (/audio|voice|speech|tts|asr|transcri|music/.test(id + traits)) return "audio";
  if (/video|wan|motion|animate/.test(id + traits)) return "video";
  if (/llama|qwen|deepseek|mistral|grok|dolphin|venice|chat|text|coder|reason/.test(id + traits))
    return "text";
  return "unknown";
}

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
    };
    groups[classifyModel(normalized)].push(normalized);
  });
  return groups;
}

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

export const initialState = {
  activeTab: "chat",
  models: withFallbackModels({}) as Record<string, import("../types/venice").ModelInfo[]>,
  usingFallbackModels: true,
  selectedChatModel: "venice-uncensored",
  selectedImageModel: "fluently-xl",
  settings: {
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    includeVeniceSystemPrompt: true,
    webSearch: "off",
    webScraping: false,
    webCitations: false,
  },
  diagnostics: null as any,
  diagnosticsLog: [] as any[],
  gallery: [] as any[],
  chats: [] as any[],
  sourcePanelOpen: true,
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

export function appReducer(state: typeof initialState, action: any) {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_MODELS": {
      const models = withFallbackModels(action.models || {});
      return {
        ...state,
        models,
        usingFallbackModels: !!action.fallback,
        selectedChatModel:
          state.selectedChatModel || models.text[0]?.id || "venice-uncensored",
        selectedImageModel:
          state.selectedImageModel || models.image[0]?.id || "fluently-xl",
        modelLoadError: action.error || "",
      };
    }
    case "SET_SELECTED_CHAT_MODEL":
      return { ...state, selectedChatModel: action.model };
    case "SET_SELECTED_IMAGE_MODEL":
      return { ...state, selectedImageModel: action.model };
    case "SET_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case "SET_DIAGNOSTICS": {
      const entry = {
        ...action.diagnostics,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      return {
        ...state,
        diagnostics: entry,
        diagnosticsLog: [entry, ...state.diagnosticsLog].slice(0, 50),
      };
    }
    case "SET_GALLERY":
      return { ...state, gallery: action.items || [] };
    case "SET_CHATS":
      return { ...state, chats: action.items || [] };
    case "TOGGLE_SOURCE_PANEL":
      return { ...state, sourcePanelOpen: !state.sourcePanelOpen };
    case "SET_CHAT_DRAFT":
      return {
        ...state,
        chatDraft: { ...state.chatDraft, ...action.patch },
      };
    case "SET_IMAGE_DRAFT":
      return {
        ...state,
        imageDraft: { ...state.imageDraft, ...action.patch },
      };
    case "SET_BATCH_DRAFT":
      return {
        ...state,
        batchDraft: { ...state.batchDraft, ...action.patch },
      };
    case "ADD_TOAST":
      return { ...state, toasts: [...state.toasts, action.toast] };
    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}
