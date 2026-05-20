/**
 * IPC handlers registered in the Electron main process.
 * Renderers call these via contextBridge / ipcRenderer.invoke().
 * All Venice API traffic flows through the local proxy server — not through IPC.
 */
import { ipcMain, app } from "electron";
import {
  isApiKeyConfigured,
  setApiKey,
  deleteApiKey,
  isEncryptionAvailable,
} from "../services/secureStore";
import { getProxyPort } from "../services/veniceProxy";
import https from "https";
import type { IncomingMessage } from "http";

const VENICE_TEST_URL = "https://api.venice.ai/api/v1/models";

/** Test Venice connectivity using the stored API key */
function testVeniceConnection(apiKey: string): Promise<{ ok: boolean; status: number; message: string }> {
  return new Promise((resolve) => {
    const req = https.get(
      VENICE_TEST_URL,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": `VeniceForge/${app.getVersion()}`,
        },
        timeout: 8000,
      },
      (res: IncomingMessage) => {
        // Consume body to free socket
        res.resume();
        const ok = res.statusCode !== undefined && res.statusCode < 400;
        resolve({
          ok,
          status: res.statusCode ?? 0,
          message: ok ? "Connection successful" : `HTTP ${res.statusCode}`,
        });
      }
    );
    req.on("error", (err: Error) => {
      resolve({ ok: false, status: 0, message: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, message: "Connection timed out" });
    });
  });
}

export function registerIpcHandlers(): void {
  // Returns the local proxy URL for the renderer
  ipcMain.handle("venice:getProxyUrl", () => {
    const port = getProxyPort();
    if (!port) throw new Error("Venice proxy has not started yet.");
    return `http://127.0.0.1:${port}/api/venice`;
  });

  // API key management
  ipcMain.handle("apiKey:isConfigured", () => isApiKeyConfigured());

  ipcMain.handle("apiKey:set", (_event, key: unknown) => {
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new Error("Invalid API key supplied.");
    }
    const trimmed = key.trim();
    if (trimmed.length > 512) throw new Error("API key too long.");
    setApiKey(trimmed);
    return { ok: true };
  });

  ipcMain.handle("apiKey:delete", () => {
    deleteApiKey();
    return { ok: true };
  });

  ipcMain.handle("apiKey:test", async () => {
    if (!isApiKeyConfigured()) {
      return { ok: false, message: "No API key configured." };
    }
    const { getApiKey } = await import("../services/secureStore");
    const key = getApiKey();
    if (!key) return { ok: false, message: "Could not read API key." };
    return testVeniceConnection(key);
  });

  // App information
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getDataPath", () => app.getPath("userData"));
  ipcMain.handle("app:isEncryptionAvailable", () => isEncryptionAvailable());

  // File export/import: dialog and file IO happen entirely in the main process.
  // The renderer passes only the JSON data string (for export); it never controls
  // the file path — that is always chosen via the OS dialog.

  ipcMain.handle("app:saveJsonFile", async (_event, data: unknown, defaultPath: unknown) => {
    if (typeof data !== "string") throw new Error("app:saveJsonFile: data must be a string");
    const resolvedPath = typeof defaultPath === "string" ? defaultPath : "venice-forge-export.json";
    const { dialog } = await import("electron");
    const result = await dialog.showSaveDialog({
      title: "Export Venice Forge data",
      defaultPath: resolvedPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    const fs = await import("fs/promises");
    await fs.writeFile(result.filePath, data, "utf-8");
    return { ok: true, canceled: false };
  });

  ipcMain.handle("app:loadJsonFile", async () => {
    const { dialog } = await import("electron");
    const result = await dialog.showOpenDialog({
      title: "Import Venice Forge data",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const fs = await import("fs/promises");
    const data = await fs.readFile(result.filePaths[0], "utf-8");
    return { canceled: false, data };
  });
}
