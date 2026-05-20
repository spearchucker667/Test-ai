import { DiagnosticsEntry, ModelInfo } from "./venice";
import { GalleryImage } from "./storage";

export interface ChatRecord {
  role: "user" | "assistant" | "system";
  content: string;
}

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

export interface BatchDraft {
  type: "text" | "image";
  prompts: string;
  model: string;
  systemPrompt: string;
}

export interface AppSettings {
  apiKey: string;
  theme: "dark" | "light" | "system";
  customModels: string[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
  duration?: number;
}

import { initialState } from "../state/appReducer";

export type AppState = typeof initialState;

export type AppAction =
  | { type: "SET_TAB"; tab: string }
  | { type: "TOGGLE_SOURCE_PANEL" }
  | { type: "SET_MODELS"; models: any; fallback?: boolean; error?: string }
  | { type: "SET_SELECTED_CHAT_MODEL"; model: string }
  | { type: "SET_SELECTED_IMAGE_MODEL"; model: string }
  | { type: "SET_SETTINGS"; settings: Partial<AppSettings> }
  | { type: "SET_DIAGNOSTICS"; diagnostics: Partial<DiagnosticsEntry> }
  | { type: "SET_GALLERY"; items: GalleryImage[] }
  | { type: "SET_CHATS"; items: any[] }
  | { type: "SET_CHAT_DRAFT"; patch: Partial<AppState['chatDraft']> }
  | { type: "SET_IMAGE_DRAFT"; patch: Partial<ImageDraft> }
  | { type: "SET_BATCH_DRAFT"; patch: Partial<BatchDraft> }
  | { type: "ADD_TOAST"; toast: ToastMessage }
  | { type: "REMOVE_TOAST"; id: string };

export type AppDispatch = React.Dispatch<AppAction>;
