/** @fileoverview Registers IPC handlers for Venice API requests, API key
 *  management, file dialogs, and application diagnostics. */

import { app, dialog, ipcMain, type WebContents } from "electron";
import fs from "fs/promises";
import path from "path";
import {
  deleteApiKey,
  deleteJinaApiKey,
  getSecureStoreStatus,
  isApiKeyConfigured,
  isJinaApiKeyConfigured,
  setApiKey,
  setJinaApiKey,
} from "../services/secureStore";
import { getLastApiError, getLogsDir, logError, openLogsFolder } from "../services/logger";
import { abortVeniceRequest, performVeniceRequest, readResponseError } from "../services/veniceClient";
import {
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
} from "../services/chatStorage";
import { validateApiKeyInput, validateVeniceIpcRequest } from "./validation";
import { redactErrorMessage } from "../../src/services/redaction";
import { registerUpdateHandlers } from "./updates";
import { VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";
import { assessChildExploitationSafety, recordDecision, SafetyGuardBlockedError } from "../../src/shared/safety";
import type { Conversation } from "../../src/types/conversation";

/** Maximum size in bytes for JSON import and export files. */
const MAX_JSON_FILE_BYTES = VENICE_MAX_BODY_BYTES;

/** Safely sends a payload to a renderer process, returning false if the
 *  WebContents has already been destroyed.
 */
function safeSendToRenderer(sender: WebContents, channel: string, payload: unknown): boolean {
  if (sender.isDestroyed()) return false;
  try { sender.send(channel, payload); return true; } catch { return false; }
}

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
      const request = validateVeniceIpcRequest(input);
      const decision = assessChildExploitationSafety({ endpoint: request.endpoint, method: request.method, payload: request.body, source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: decision.userMessage,
            reasonCode: decision.reasonCode,
            category: decision.category,
            severity: decision.severity,
          },
          contentType: "application/json",
        };
      }
      return await performVeniceRequest(request);
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: err.decision.userMessage,
            reasonCode: err.decision.reasonCode,
            category: err.decision.category,
            severity: err.decision.severity,
          },
          contentType: "application/json",
        };
      }
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
      const decision = assessChildExploitationSafety({ endpoint: request.endpoint, method: request.method, payload: request.body, source: "ipc" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: decision.userMessage,
            reasonCode: decision.reasonCode,
            category: decision.category,
            severity: decision.severity,
          },
          contentType: "application/json",
        };
      }
      return await performVeniceRequest(request, {
        onDelta: (delta) => {
          safeSendToRenderer(event.sender, "venice:streamDelta", {
            signalId: request.signalId || "",
            delta,
          });
        },
      });
    } catch (err) {
      if (err instanceof SafetyGuardBlockedError) {
        return {
          ok: false,
          status: 451,
          statusText: "Blocked by local safety guard",
          headers: {},
          body: {
            error: err.decision.userMessage,
            reasonCode: err.decision.reasonCode,
            category: err.decision.category,
            severity: err.decision.severity,
          },
          contentType: "application/json",
        };
      }
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
    try {
      const trimmed = validateApiKeyInput(key);
      setApiKey(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("apiKey:delete", () => {
    try {
      deleteApiKey();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("apiKey:test", () => testVeniceConnection());

  ipcMain.handle("jinaApiKey:isConfigured", () => isJinaApiKeyConfigured());

  ipcMain.handle("jinaApiKey:set", (_event, key: unknown) => {
    try {
      const trimmed = typeof key === "string" ? key.trim() : "";
      if (!trimmed) throw new Error("Enter a Jina API key before saving.");
      if (trimmed.length > 512) throw new Error("Jina API key is too long.");
      setJinaApiKey(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("jinaApiKey:delete", () => {
    try {
      deleteJinaApiKey();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("jinaApiKey:test", async () => {
    const jinaKey = (() => {
      try {
        const store = require("../services/secureStore") as typeof import("../services/secureStore");
        return store.getJinaApiKey();
      } catch { return null; }
    })();
    try {
      const headers: Record<string, string> = {};
      if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;
      const response = await fetch("https://r.jina.ai/https://example.com", { headers, method: "GET" });
      return {
        ok: response.ok,
        status: response.status,
        message: response.ok ? "Jina connection successful" : `Jina returned ${response.status}`,
      };
    } catch (err) {
      return { ok: false, status: 0, message: redactErrorMessage(err) };
    }
  });

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
      if (result.canceled || !result.filePaths[0]) return { ok: true, canceled: true };
      const stat = await fs.stat(result.filePaths[0]);
      if (stat.size > MAX_JSON_FILE_BYTES) {
        throw new Error("Import file is too large.");
      }
      const data = await fs.readFile(result.filePaths[0], "utf-8");
      return { ok: true, canceled: false, data };
    } catch (err) {
      return { ok: false, canceled: false, error: redactErrorMessage(err) };
    }
  });

  ipcMain.handle("chat:list", async () => {
    try {
      const conversations = await listConversations();
      return { ok: true, conversations };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:list failed", message);
      return { ok: false, error: message, conversations: [] };
    }
  });

  ipcMain.handle("chat:get", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128) {
        return { ok: false, error: "Invalid conversation id", conversation: null };
      }
      const conversation = await getConversation(id);
      return { ok: true, conversation };
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:get failed", message);
      return { ok: false, error: message, conversation: null };
    }
  });

  ipcMain.handle("chat:save", async (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        return { ok: false, error: "Invalid payload" };
      }
      const p = payload as Record<string, unknown>;
      if (!p.conversation || typeof p.conversation !== "object") {
        return { ok: false, error: "Missing conversation" };
      }
      const result = await saveConversation(p.conversation as Conversation);
      return result;
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:save failed", message);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("chat:delete", async (_event, id: unknown) => {
    try {
      if (typeof id !== "string" || id.length > 128) {
        return { ok: false, error: "Invalid conversation id" };
      }
      return await deleteConversation(id);
    } catch (err) {
      const message = redactErrorMessage(err);
      logError("chat:delete failed", message);
      return { ok: false, error: message };
    }
  });
}
