/** @fileoverview Electron vs. web mode abstraction — never call window.veniceForge directly from modules. */

// Code Owner: fayeblade (@spearchucker667)
import "../types/desktop";
import type { VeniceForgeDiagnostics, VeniceForgeRequest, VeniceForgeResponse } from "../types/desktop";
import StorageService from "./storageService";
import { veniceFetch } from "./veniceClient";

/**
 * Detects whether the app is currently running inside the Electron desktop shell.
 * @returns True if running in Electron desktop mode.
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && window.veniceForge?.isDesktop === true;
}

/**
 * Initializes the desktop bridge by pinging the main process diagnostics endpoint.
 * @returns A promise that resolves once the handshake is complete.
 */
export async function initDesktopBridge(): Promise<void> {
  if (!isElectron()) return;
  await window.veniceForge!.app.getDiagnostics();
}

/**
 * Generates a unique signal identifier for cancellable desktop requests.
 * @returns A random UUID string.
 */
function createSignalId(): string {
  return crypto.randomUUID();
}

/**
 * Attaches an AbortSignal to a desktop request so the main process can cancel it.
 * @param signalId The unique signal identifier for the request.
 * @param signal The optional AbortSignal to observe.
 * @returns A cleanup function that removes the abort listener, or undefined if no signal was provided.
 */
function attachAbort(signalId: string, signal?: AbortSignal): (() => void) | undefined {
  if (!signal) return undefined;
  const abort = () => {
    window.veniceForge?.venice.abort(signalId).catch(() => {});
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

/** Wraps desktop Venice API requests with signal-based cancellation. */
export const desktopVenice = {
  /**
   * Sends a single Venice API request through the desktop IPC bridge.
   * @param input The request payload including endpoint, method, body, and headers.
   * @param signal An optional abort signal for cancellation.
   * @returns A promise resolving to the Venice API response.
   */
  async request(input: VeniceForgeRequest, signal?: AbortSignal): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.request({ ...input, signalId });
    } finally {
      cleanup?.();
    }
  },

  /**
   * Streams a chat completion through the desktop IPC bridge.
   * @param input The request payload.
   * @param onDelta Callback invoked for each streamed delta chunk.
   * @param signal An optional abort signal for cancellation.
   * @returns A promise resolving once the stream completes.
   */
  async streamChat(
    input: VeniceForgeRequest,
    onDelta: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.streamChat({ ...input, signalId }, onDelta);
    } finally {
      cleanup?.();
    }
  },
};

/** Manages the Venice API key across desktop and web storage backends. */
export const desktopApiKey = {
  /**
   * Checks whether an API key has been configured.
   * @returns A promise resolving to true if a key is present.
   */
  async isConfigured(): Promise<boolean> {
    if (isElectron()) return window.veniceForge!.apiKey.isConfigured();
    const items = await StorageService.getItems("settings");
    return items.some((item) => item.id === "venice-api-key" && !!item.value);
  },

  /**
   * Stores the Venice API key securely.
   * @param key The API key string to persist.
   * @returns A promise resolving to an ok flag.
   */
  async set(key: string): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.apiKey.set(key);
    await StorageService.saveItem("settings", {
      id: "venice-api-key",
      value: key,
      timestamp: Date.now(),
    });
    return { ok: true };
  },

  /**
   * Removes the stored Venice API key.
   * @returns A promise resolving to an ok flag.
   */
  async delete(): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.apiKey.delete();
    await StorageService.deleteItem("settings", "venice-api-key");
    return { ok: true };
  },

  /**
   * Tests the configured API key by listing models.
   * @returns A promise resolving to the test result, status, and message.
   */
  async test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (isElectron()) return window.veniceForge!.apiKey.test();
    try {
      const { response } = await veniceFetch("/models", { retry: false });
      return { ok: response.ok, status: response.status, message: response.statusText };
    } catch (err: any) {
      return { ok: false, status: err.status, message: err.message };
    }
  },
};

/** Exposes app-level metadata and desktop-specific utilities. */
export const desktopApp = {
  /**
   * Retrieves the current application version.
   * @returns A promise resolving to the version string, or "web" in browser mode.
   */
  getVersion(): Promise<string> {
    if (!isElectron()) return Promise.resolve("web");
    return window.veniceForge!.app.getVersion();
  },

  /**
   * Retrieves the user data directory path.
   * @returns A promise resolving to the path, or a web storage indicator in browser mode.
   */
  getDataPath(): Promise<string> {
    if (!isElectron()) return Promise.resolve("IndexedDB (browser)");
    return window.veniceForge!.app.getDataPath();
  },

  /**
   * Checks whether OS-level encryption is available for key storage.
   * @returns A promise resolving to true if encryption is available.
   */
  isEncryptionAvailable(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.app.isEncryptionAvailable();
  },

  /**
   * Fetches diagnostic information about the app environment.
   * @returns A promise resolving to a diagnostics snapshot.
   */
  getDiagnostics(): Promise<VeniceForgeDiagnostics> {
    if (!isElectron()) {
      return Promise.resolve({
        isDesktop: false,
        appVersion: "web",
        userDataPath: "IndexedDB (browser)",
        storageMode: "web",
        secureStorageAvailable: false,
        apiKeyConfigured: false,
        transport: "web-proxy",
      });
    }
    return window.veniceForge!.app.getDiagnostics();
  },

  /**
   * Opens the log folder in the OS file explorer.
   * @returns A promise resolving to the open result and path.
   */
  openLogsFolder(): Promise<{ ok: boolean; path: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, path: "" });
    return window.veniceForge!.app.openLogsFolder();
  },
};

/** Handles JSON file export and import, falling back to browser downloads in web mode. */
export const desktopFiles = {
  /**
   * Exports data as a JSON file via native dialog or browser download.
   * @param data The data to serialize and save.
   * @param defaultPath The suggested filename.
   * @returns A promise resolving to true if the save succeeded.
   */
  async exportJson(data: unknown, defaultPath = "venice-forge-export.json"): Promise<boolean> {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    if (!isElectron()) {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }
    const result = await window.veniceForge!.files.saveJsonFile(json, defaultPath);
    return result.ok;
  },

  /**
   * Imports a JSON string via native file dialog (desktop only).
   * @returns A promise resolving to the file contents, or null if cancelled.
   */
  async importJsonString(): Promise<string | null> {
    if (!isElectron()) return null;
    const result = await window.veniceForge!.files.loadJsonFile();
    if (result.canceled || !result.data) return null;
    return result.data;
  },
};
