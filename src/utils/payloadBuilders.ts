// Code Owner: fayeblade (@spearchucker667)
// Shared payload builders for Venice API requests.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatSettings {
  includeVeniceSystemPrompt?: boolean;
  /** Venice API expects "auto" | "off" | "on" — not a boolean. */
  webSearch?: string;
  webScraping?: boolean;
  webCitations?: boolean;
}

export interface ChatPayloadOptions {
  stream?: boolean;
  characterSlug?: string;
  reasoningEffort?: string;
  enableXSearch?: boolean;
  stripThinking?: boolean;
  disableThinking?: boolean;
}

function normalizeWebSearchMode(value: unknown): "off" | "on" | "auto" {
  if (value === true) return "on";
  if (value === false) return "off";
  if (value === "off" || value === "on" || value === "auto") return value;
  return "off";
}

export function buildChatPayload(
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  options: ChatPayloadOptions = {}
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    venice_parameters: {
      include_venice_system_prompt: !!settings.includeVeniceSystemPrompt,
      // Venice requires string enum "auto" | "off" | "on" — never a boolean.
      enable_web_search: normalizeWebSearchMode(settings.webSearch),
      enable_web_scraping: !!settings.webScraping,
      enable_web_citations: !!settings.webCitations,
      enable_x_search: !!options.enableXSearch,
      strip_thinking_response: !!options.stripThinking,
      disable_thinking: !!options.disableThinking,
    },
  };
  if (options.stream) payload.stream = true;
  const slug = options.characterSlug?.trim();
  if (slug) (payload.venice_parameters as Record<string, unknown>).character_slug = slug;
  if (options.reasoningEffort) payload.reasoning = { effort: options.reasoningEffort };
  return payload;
}

export interface ImageDraftLike {
  prompt: string;
  negative?: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  steps?: number | string;
  cfg?: number | string;
  style?: string;
  safeMode?: boolean;
  disableWatermark?: boolean;
}

export function buildImagePayload(
  model: string,
  draft: ImageDraftLike,
  promptOverride?: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    prompt: (promptOverride ?? draft.prompt).trim(),
    width: Number(draft.width) || 512,
    height: Number(draft.height) || 512,
    aspect_ratio: draft.aspectRatio || "1:1",
    steps: Number(draft.steps) || 20,
    cfg_scale: Number(draft.cfg) || 7,
    safe_mode: !!draft.safeMode,
    hide_watermark: !!draft.disableWatermark,
    return_binary: false,
  };
  const negative = draft.negative?.trim();
  if (negative) payload.negative_prompt = negative;
  if (draft.style) payload.style_preset = draft.style;
  return payload;
}
