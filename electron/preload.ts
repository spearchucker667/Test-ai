/**
 * Electron preload script.
 *
 * Exposes a narrow, typed API surface to the renderer via contextBridge.
 * No Node.js APIs, no arbitrary IPC, no API key access for the renderer.
 *
 * All IPC channel names must be kept in sync with electron/ipc/handlers.ts.
 */
import { contextBridge, ipcRenderer } from "electron";

const veniceForge = {
  /** True when running inside Electron desktop */
  isDesktop: true as const,

  /** Returns the local proxy URL: http://127.0.0.1:{port}/api/venice */
  getProxyUrl(): Promise<string> {
    return ipcRenderer.invoke("venice:getProxyUrl");
  },

  apiKey: {
    isConfigured(): Promise<boolean> {
      return ipcRenderer.invoke("apiKey:isConfigured");
    },
    set(key: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:set", key);
    },
    delete(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:delete");
    },
    test(): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("apiKey:test");
    },
  },

  app: {
    getVersion(): Promise<string> {
      return ipcRenderer.invoke("app:getVersion");
    },
    getDataPath(): Promise<string> {
      return ipcRenderer.invoke("app:getDataPath");
    },
    isEncryptionAvailable(): Promise<boolean> {
      return ipcRenderer.invoke("app:isEncryptionAvailable");
    },
  },

  files: {
    /** Shows a save dialog then writes data to the chosen path. Returns canceled:true if dismissed. */
    saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }> {
      return ipcRenderer.invoke("app:saveJsonFile", data, defaultPath);
    },
    /** Shows an open dialog then reads the chosen file. Returns canceled:true if dismissed. */
    loadJsonFile(): Promise<{ canceled: boolean; data?: string }> {
      return ipcRenderer.invoke("app:loadJsonFile");
    },
  },
};

contextBridge.exposeInMainWorld("veniceForge", veniceForge);
