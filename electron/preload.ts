/** @fileoverview Exposes a hardened contextBridge API to the renderer for Venice
 *  API requests, secure key storage, and app diagnostics. */

import { contextBridge, ipcRenderer } from "electron";

/** Represents a Venice API request sent from the renderer to the main process. */
type VeniceRequest = {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
};

/** API surface exposed to the renderer via contextBridge. */
const veniceForge = {
  /** Marks the current environment as a desktop Electron build. */
  isDesktop: true as const,

  venice: {
    /** Sends a single Venice API request through IPC and awaits the response.
     *  @param input The Venice request payload.
     *  @returns A promise resolving with the main process response.
     */
    request(input: VeniceRequest) {
      return ipcRenderer.invoke("venice:request", input);
    },
    /** Initiates a streaming chat completion and delivers deltas via IPC events.
     *  @param input The Venice request payload.
     *  @param onDelta Callback invoked for each streamed text delta.
     *  @returns A promise that settles when the stream ends or errors.
     */
    streamChat(input: VeniceRequest, onDelta: (delta: string) => void) {
      const signalId = input.signalId || crypto.randomUUID();
      const listener = (_event: Electron.IpcRendererEvent, payload: { signalId: string; delta: string }) => {
        if (payload.signalId === signalId && typeof payload.delta === "string") {
          onDelta(payload.delta);
        }
      };
      ipcRenderer.on("venice:streamDelta", listener);
      const pending = ipcRenderer.invoke("venice:streamChat", { ...input, signalId });
      // If the renderer is killed before the stream ends, notify main to abort
      // so the activeRequests Map does not leak.
      const beforeUnload = () => {
        ipcRenderer.invoke("venice:abort", signalId).catch(() => {});
      };
      const global = globalThis as typeof globalThis & { addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void };
      global.addEventListener("beforeunload", beforeUnload);
      return pending.finally(() => {
        global.removeEventListener("beforeunload", beforeUnload);
        ipcRenderer.removeListener("venice:streamDelta", listener);
      });
    },
    /** Signals the main process to abort an active Venice request.
     *  @param signalId The identifier of the request to abort.
     *  @returns A promise resolving when the abort signal is sent.
     */
    abort(signalId: string) {
      return ipcRenderer.invoke("venice:abort", signalId);
    },
  },

  apiKey: {
    /** Checks whether a Venice API key has been stored securely.
     *  @returns A promise resolving to true when a key is configured.
     */
    isConfigured(): Promise<boolean> {
      return ipcRenderer.invoke("apiKey:isConfigured");
    },
    /** Stores the Venice API key using OS-level encryption.
     *  @param key The API key to encrypt and store.
     *  @returns A promise resolving with the operation result.
     */
    set(key: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:set", key);
    },
    /** Removes the stored Venice API key.
     *  @returns A promise resolving with the operation result.
     */
    delete(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:delete");
    },
    /** Verifies connectivity to the Venice API with the stored key.
     *  @returns A promise resolving with the test result and status.
     */
    test(): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("apiKey:test");
    },
  },

  app: {
    /** Returns the current application version.
     *  @returns A promise resolving with the version string.
     */
    getVersion(): Promise<string> {
      return ipcRenderer.invoke("app:getVersion");
    },
    /** Returns the path to the application's user data directory.
     *  @returns A promise resolving with the absolute path.
     */
    getDataPath(): Promise<string> {
      return ipcRenderer.invoke("app:getDataPath");
    },
    /** Checks whether OS-level encryption is available for secure storage.
     *  @returns A promise resolving to true when encryption is available.
     */
    isEncryptionAvailable(): Promise<boolean> {
      return ipcRenderer.invoke("app:isEncryptionAvailable");
    },
    /** Retrieves application diagnostics and runtime information. */
    getDiagnostics() {
      return ipcRenderer.invoke("app:getDiagnostics");
    },
    /** Opens the log folder in the system file manager.
     *  @returns A promise resolving with the operation result.
     */
    openLogsFolder(): Promise<{ ok: boolean; path: string }> {
      return ipcRenderer.invoke("app:openLogsFolder");
    },
  },

  files: {
    /** Shows a save dialog and writes JSON data to the selected file.
     *  @param data The JSON string to write.
     *  @param defaultPath Optional default filename for the dialog.
     *  @returns A promise resolving with the save result.
     */
    saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }> {
      return ipcRenderer.invoke("app:saveJsonFile", data, defaultPath);
    },
    /** Shows an open dialog and reads JSON data from the selected file.
     *  @returns A promise resolving with the loaded data or cancellation.
     */
    loadJsonFile(): Promise<{ ok?: boolean; canceled: boolean; data?: string; error?: string }> {
      return ipcRenderer.invoke("app:loadJsonFile");
    },
  },

  chat: {
    /** Lists all persisted conversations. */
    list(): Promise<{ ok: boolean; conversations: import("../src/types/conversation").Conversation[]; error?: string }> {
      return ipcRenderer.invoke("chat:list");
    },
    /** Retrieves a single conversation by id. */
    get(id: string): Promise<{ ok: boolean; conversation: import("../src/types/conversation").Conversation | null; error?: string }> {
      return ipcRenderer.invoke("chat:get", id);
    },
    /** Saves a conversation atomically to disk. */
    save(conversation: import("../src/types/conversation").Conversation): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:save", { conversation });
    },
    /** Deletes a conversation by id. */
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:delete", id);
    },
  },

  updates: {
    checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }> {
      return ipcRenderer.invoke("app:checkForUpdates");
    },
    downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("app:downloadUpdate");
    },
    installUpdate(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("app:installUpdate");
    },
    onUpdateAvailable(callback: (info: import("electron-updater").UpdateInfo) => void) {
      const listener = (_event: Electron.IpcRendererEvent, info: import("electron-updater").UpdateInfo) => callback(info);
      ipcRenderer.on("updates:available", listener);
      return () => {
        ipcRenderer.removeListener("updates:available", listener);
      };
    },
    onUpdateNotAvailable(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on("updates:not-available", listener);
      return () => {
        ipcRenderer.removeListener("updates:not-available", listener);
      };
    },
    onDownloadProgress(callback: (progress: import("electron-updater").ProgressInfo) => void) {
      const listener = (_event: Electron.IpcRendererEvent, progress: import("electron-updater").ProgressInfo) => callback(progress);
      ipcRenderer.on("updates:progress", listener);
      return () => {
        ipcRenderer.removeListener("updates:progress", listener);
      };
    },
    onUpdateDownloaded(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on("updates:downloaded", listener);
      return () => {
        ipcRenderer.removeListener("updates:downloaded", listener);
      };
    },
    onUpdateError(callback: (error: string) => void) {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on("updates:error", listener);
      return () => {
        ipcRenderer.removeListener("updates:error", listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("veniceForge", veniceForge);
