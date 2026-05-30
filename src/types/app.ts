/** @fileoverview Core application type definitions for state, actions, and UI models. */

import { DiagnosticsEntry } from "./venice";
import { GalleryImage } from "./storage";
import type { Conversation } from "./conversation";

/** Represents a single message in a chat conversation. */
export interface ChatRecord {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Captures the current image generation form state. */
export interface ImageDraft {
  prompt: string;
  negative: string;
  width: number;
  height: number;
  aspectRatio: string;
  steps: number | string;
  cfg: number | string;
  style: string;
  safeMode: boolean;
  disableWatermark: boolean;
  imageCount: number | string;
  currentImage: string;
  currentImages: GalleryImage[];
  currentBatchId: string | null;
  lastSavedImageId: string | null;
  generationProgress: string;
  batchQueueStatus: string;
}

/** Captures the current batch job form state. */
export interface BatchDraft {
  type: "text" | "image";
  promptsText: string;
}

/** User-configurable settings persisted across sessions. API keys are stored separately via safeStorage and never written here. */
import type { Theme } from "../theme/themeTypes";

export interface AppSettings {
  defaultSystemPrompt: string;
  includeVeniceSystemPrompt: boolean;
  webSearch: string;
  webScraping: boolean;
  webCitations: boolean;
  theme: "dark" | "light" | "system";
  customModels: string[];
  selectedThemeId: string;
  appearanceMode: "dark" | "light";
  customTheme: Theme | null;
}

/** Describes a transient toast notification shown to the user. */
export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
  duration?: number;
}

/** Explicit shape of the global application state. Defined here to break the circular
 *  dependency between appReducer (which needs AppAction) and this file (which needed initialState). */
export interface AppState {
  activeTab: string;
  models: Record<string, import("./venice").ModelInfo[]>;
  usingFallbackModels: boolean;
  selectedChatModel: string;
  selectedImageModel: string;
  settings: AppSettings;
  diagnostics: import("./venice").DiagnosticsEntry | null;
  diagnosticsLog: import("./venice").DiagnosticsEntry[];
  gallery: import("./storage").GalleryImage[];
  chats: import("./storage").ChatHistoryItem[];
  conversations: Conversation[];
  activeConversationId: string | null;
  sourcePanelOpen: boolean;
  isOnline: boolean;
  modelLoadError: string;
  imageDraft: ImageDraft;
  batchDraft: BatchDraft;
  chatDraft: {
    systemPrompt: string;
    messages: ChatRecord[];
  };
  toasts: ToastMessage[];
}

/** Discriminated union of all actions accepted by the application reducer. */
export type AppAction =
  | { type: "SET_TAB"; tab: string }
  | { type: "TOGGLE_SOURCE_PANEL" }
  | { type: "SET_MODELS"; models: Record<string, import("./venice").ModelInfo[]> | undefined; fallback?: boolean; error?: string }
  | { type: "SET_SELECTED_CHAT_MODEL"; model: string }
  | { type: "SET_SELECTED_IMAGE_MODEL"; model: string }
  | { type: "SET_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "SET_DIAGNOSTICS"; diagnostics: Partial<DiagnosticsEntry> }
  | { type: "SET_GALLERY"; items: GalleryImage[] }
  | { type: "SET_CHATS"; items: import("./storage").ChatHistoryItem[] }
  | { type: "SET_CONVERSATIONS"; items: Conversation[] }
  | { type: "SET_ACTIVE_CONVERSATION"; id: string | null }
  | { type: "SET_CHAT_DRAFT"; patch: Partial<AppState['chatDraft']> }
  | { type: "SET_IMAGE_DRAFT"; patch: Partial<ImageDraft> }
  | { type: "SET_BATCH_DRAFT"; patch: Partial<BatchDraft> }
  | { type: "SET_ONLINE"; online: boolean }
  | { type: "ADD_TOAST"; toast: ToastMessage }
  | { type: "REMOVE_TOAST"; id: string };

/** Dispatch function type for the global application reducer. */
export type AppDispatch = React.Dispatch<AppAction>;

/** Shared props type for feature modules that consume global state + dispatch. */
export interface ModuleProps {
  state: AppState;
  dispatch: AppDispatch;
}
