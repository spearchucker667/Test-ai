/** @fileoverview Registers IPC handlers for Venice API requests, API key
 *  management, file dialogs, and application diagnostics. */

import { app, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import {
  deleteApiKey,
  getSecureStoreStatus,
  isApiKeyConfigured,
  setApiKey,
} from "../services/secureStore";
import { getLastApiError, getLogsDir, logError, openLogsFolder } from "../services/logger";
import { abortVeniceRequest, performVeniceRequest, readResponseError } from "../services/veniceClient";
import { validateApiKeyInput, validateVeniceIpcRequest } from "./validation";
import { redactErrorMessage } from "../../src/services/redaction";
import { registerUpdateHandlers } from "./updates";
import { VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";

/** Maximum size in bytes for JSON import and export files. */
const MAX_JSON_FILE_BYTES = VENICE_MAX_BODY_BYTES;

/** Tests connectivity to the Venice API using the stored API key.
 *  @returns A result object indicating success or failure with a message.
 */
async function testVeniceConnection(): Promise<{ ok: boolean; status?: number; message: string }> {
  if (!isApiKeyConfigured()) {
    return { ok: false, message: "No API key configured." };
  }
  try {
    const response = await performVeniceRequest({ endpoint: "/models", method: "GET" });
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? "Connection successful" : readResponseError(response),
    };
  } catch (err) {
    return { ok: false, status: 0, message: redactErrorMessage(err) };
  }
}

/** Registers all IPC handlers used by the renderer process. */
export function registerIpcHandlers(): void {
  registerUpdateHandlers();

  ipcMain.handle("venice:request", async (_event, input: unknown) => {
    try {
      validateVeniceIpcRequest(input);
      return await performVeniceRequest(input);
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("Venice IPC request failed", message);
      return {
        ok: false,
        status: 0,
        statusText: "Local transport error",
        headers: {},
        body: { error: message },
        contentType: "application/json",
      };
    }
  });

  ipcMain.handle("venice:streamChat", async (event, input: unknown) => {
    try {
      const request = validateVeniceIpcRequest(input);
      if (request.endpoint !== "/chat/completions" || request.method !== "POST") {
        throw new Error("Streaming is only available for POST /chat/completions.");
      }
      return await performVeniceRequest(request, {
        onDelta: (delta) => {
          event.sender.send("venice:streamDelta", {
            signalId: request.signalId || "",
            delta,
          });
        },
      });
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("Venice stream request failed", message);
      return {
        ok: false,
        status: 0,
        statusText: "Local transport error",
        headers: {},
        body: { error: message },
        contentType: "application/json",
      };
    }
  });

  ipcMain.handle("venice:abort", (_event, signalId: unknown) => {
    if (typeof signalId !== "string" || signalId.length > 128) return { ok: false };
    return abortVeniceRequest(signalId);
  });

  ipcMain.handle("apiKey:isConfigured", () => isApiKeyConfigured());

  ipcMain.handle("apiKey:set", (_event, key: unknown) => {
    const trimmed = validateApiKeyInput(key);
    setApiKey(trimmed);
    return { ok: true };
  });

  ipcMain.handle("apiKey:delete", () => {
    deleteApiKey();
    return { ok: true };
  });

  ipcMain.handle("apiKey:test", () => testVeniceConnection());

  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getDataPath", () => app.getPath("userData"));
  ipcMain.handle("app:isEncryptionAvailable", () => getSecureStoreStatus().encryptionAvailable);
  ipcMain.handle("app:getDiagnostics", () => {
    const secureStore = getSecureStoreStatus();
    return {
      isDesktop: true,
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      userDataPath: app.getPath("userData"),
      logsPath: getLogsDir(),
      storageMode: secureStore.mode,
      secureStorageAvailable: secureStore.encryptionAvailable,
      securePrefsCorrupted: secureStore.corrupted,
      securePrefsError: secureStore.error,
      apiKeyConfigured: isApiKeyConfigured(),
      transport: "direct-ipc",
      lastApiError: getLastApiError(),
    };
  });
  ipcMain.handle("app:openLogsFolder", () => openLogsFolder());

  ipcMain.handle("app:saveJsonFile", async (_event, data: unknown, defaultPath: unknown) => {
    try {
      if (typeof data !== "string") throw new Error("Export data must be a string.");
      if (Buffer.byteLength(data, "utf-8") > MAX_JSON_FILE_BYTES) {
        throw new Error("Export data is too large.");
      }
      const sanitizedFilename = path.basename(
        typeof defaultPath === "string" ? defaultPath : "venice-forge-export.json"
      );
      const result = await dialog.showSaveDialog({
        title: "Export Venice Forge data",
        defaultPath: sanitizedFilename,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fs.writeFile(result.filePath, data, "utf-8");
      return { ok: true, canceled: false };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("app:loadJsonFile", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Import Venice Forge data",
        filters: [{ name: "JSON", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      const stat = await fs.stat(result.filePaths[0]);
      if (stat.size > MAX_JSON_FILE_BYTES) {
        throw new Error("Import file is too large.");
      }
      const data = await fs.readFile(result.filePaths[0], "utf-8");
      return { canceled: false, data };
    } catch (err) {
      return { canceled: false, error: redactErrorMessage(err) };
    }
  });
}
