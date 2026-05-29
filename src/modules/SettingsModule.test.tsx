// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SettingsModule } from "./SettingsModule";
import { initialState } from "../state/appReducer";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../services/storageService", () => ({
  default: {
    saveItem: vi.fn().mockResolvedValue({ id: "x", timestamp: 1 }),
    getItems: vi.fn().mockResolvedValue([]),
    clearStore: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../services/exportImport", () => ({
  createExportPayload: vi.fn().mockReturnValue({
    version: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    appVersion: "1.0.0",
    data: { images: [], chats: [], settings: [] },
  }),
  validateImportJson: vi.fn().mockReturnValue({
    payload: { data: { images: [], chats: [], settings: [] } },
    summary: { imagesFound: 0, chatsFound: 0, settingsFound: 0, skippedRecords: 0 },
  }),
}));

// isElectron() returns false in jsdom (no window.veniceForge).
vi.mock("../services/desktopBridge", () => ({
  isElectron: vi.fn().mockReturnValue(false),
  desktopApiKey: {
    isConfigured: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue({ ok: true }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
    test: vi.fn().mockResolvedValue({ ok: true }),
  },
  desktopApp: {
    getVersion: vi.fn().mockResolvedValue("1.0.0"),
    getDiagnostics: vi.fn().mockResolvedValue({ isDesktop: false, transport: "web-proxy" }),
  },
  desktopFiles: {
    exportJson: vi.fn().mockResolvedValue(true),
    importJsonString: vi.fn().mockResolvedValue(null),
  },
  desktopUpdates: {
    checkForUpdates: vi.fn().mockResolvedValue({ ok: true, version: "2.0.0" }),
    downloadUpdate: vi.fn().mockResolvedValue({ ok: true }),
    installUpdate: vi.fn().mockResolvedValue({ ok: true }),
    onUpdateAvailable: vi.fn().mockReturnValue(vi.fn()),
    onUpdateNotAvailable: vi.fn().mockReturnValue(vi.fn()),
    onDownloadProgress: vi.fn().mockReturnValue(vi.fn()),
    onUpdateDownloaded: vi.fn().mockReturnValue(vi.fn()),
    onUpdateError: vi.fn().mockReturnValue(vi.fn()),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { createExportPayload, validateImportJson } from "../services/exportImport";
import StorageService from "../services/storageService";

const mockDispatch = vi.fn();
const mockOnApiKeyChange = vi.fn();

function renderSettings(stateOverride: object = {}) {
  const state = { ...initialState, ...stateOverride };
  return render(
    <SettingsModule
      state={state}
      dispatch={mockDispatch}
      apiKeyConfigured={false}
      onApiKeyChange={mockOnApiKeyChange}
    />
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SettingsModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the save settings button", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: /save settings/i })).toBeInTheDocument();
  });

  it("dispatches SET_SETTINGS with updated prompt when save is clicked", async () => {
    renderSettings();
    // Find the system prompt textarea by its current value (the default system prompt).
    // The Field component does not associate labels via htmlFor, so we query by display value.
    const promptField = screen.getByDisplayValue(initialState.settings.defaultSystemPrompt);
    await userEvent.clear(promptField);
    await userEvent.type(promptField, "You are a pirate assistant.");
    await userEvent.click(screen.getByRole("button", { name: /save settings/i }));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SET_SETTINGS",
        settings: expect.objectContaining({ defaultSystemPrompt: "You are a pirate assistant." }),
      })
    );
  });

  it("shows a ConfirmModal then dispatches SET_GALLERY/SET_CHATS on confirm", async () => {
    renderSettings();

    // Click the destructive button — a ConfirmModal should appear.
    await userEvent.click(screen.getByRole("button", { name: /clear indexeddb history/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete all indexeddb history/i)).toBeInTheDocument();

    // Confirm the action.
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(StorageService.clearStore).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_GALLERY", items: [] });
      expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_CHATS", items: [] });
    });
  });

  // BUG-003 regression guard: clearing settings must reset every global settings-backed default.
  it("dispatches a complete settings reset when local settings are cleared", async () => {
    renderSettings({
      settings: {
        ...initialState.settings,
        defaultSystemPrompt: "custom",
        webSearch: "auto",
        includeVeniceSystemPrompt: false,
        webScraping: true,
        webCitations: true,
      },
    });

    await userEvent.click(screen.getByRole("button", { name: /clear local settings/i }));

    await waitFor(() => {
      expect(StorageService.clearStore).toHaveBeenCalledWith("settings");
      expect(mockDispatch).toHaveBeenCalledWith({
        type: "SET_SETTINGS",
        settings: {
          defaultSystemPrompt: initialState.settings.defaultSystemPrompt,
          webSearch: "off",
          includeVeniceSystemPrompt: true,
          webScraping: false,
          webCitations: false,
        },
      });
    });
  });

  it("dismisses the ConfirmModal when cancel is clicked and does NOT clear history", async () => {
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /clear indexeddb history/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(StorageService.clearStore).not.toHaveBeenCalled();
  });

  it("calls createExportPayload and exportJson when export is clicked (desktop mode)", async () => {
    const { isElectron, desktopFiles } = await import("../services/desktopBridge");
    (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(true);

    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /export data/i }));

    await waitFor(() => {
      expect(createExportPayload).toHaveBeenCalled();
      expect(desktopFiles.exportJson).toHaveBeenCalled();
    });

    (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("calls validateImportJson and dispatches state when import succeeds", async () => {
    const { isElectron, desktopFiles } = await import("../services/desktopBridge");
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopFiles.importJsonString).mockResolvedValue(
      JSON.stringify({ version: 1, data: { images: [], chats: [], settings: [] } })
    );
    // Pre-import backup save dialog should succeed.
    vi.mocked(desktopFiles.exportJson).mockResolvedValue(true);
    vi.mocked(validateImportJson).mockReturnValue({
      payload: {
        data: {
          images: [],
          chats: [],
          settings: [
            {
              id: "app-settings",
              timestamp: 1,
              value: { defaultSystemPrompt: "imported prompt", webSearch: "off" },
            },
          ],
        },
      } as any,
      summary: { imagesFound: 0, chatsFound: 0, settingsFound: 1, skippedRecords: 0 },
    });
    vi.mocked(StorageService.getItems)
      .mockResolvedValueOnce([]) // images before backup
      .mockResolvedValueOnce([]) // chats before backup
      .mockResolvedValueOnce([
        { id: "app-settings", timestamp: 999, value: { defaultSystemPrompt: "old prompt" } },
      ]) // settings before backup
      .mockResolvedValueOnce([]) // images after import
      .mockResolvedValueOnce([]) // chats after import
      .mockResolvedValueOnce([
        { id: "app-settings", timestamp: 999, value: { defaultSystemPrompt: "old prompt" } },
      ]); // settings after import (new one not latest by timestamp)

    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: /import data/i }));

    await waitFor(() => {
      expect(validateImportJson).toHaveBeenCalled();
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SET_GALLERY" })
      );
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SET_SETTINGS",
          settings: expect.objectContaining({ defaultSystemPrompt: "imported prompt" }),
        })
      );
    });

    (isElectron as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });
});
