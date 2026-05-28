import React, { useState } from "react";
import StorageService from "../services/storageService";
import { STORE_NAMES, DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { Field } from "../components/Field";
import { Chip } from "../components/Chip";
import { ModelSelect } from "../components/ModelSelect";
import { StatusBlock } from "../components/StatusBlock";
import { ConfirmModal } from "../components/ConfirmModal";
import { isElectron, desktopApiKey, desktopApp, desktopFiles, desktopUpdates } from "../services/desktopBridge";
import { createExportPayload, validateImportJson } from "../services/exportImport";

interface SettingsModuleProps {
  state: any;
  dispatch: any;
  apiKeyConfigured: boolean | null;
  onApiKeyChange: (configured: boolean) => void;
}

type PendingConfirm = { message: string; detail?: string; onConfirm: () => Promise<void> | void };

export function SettingsModule({ state, dispatch, apiKeyConfigured, onApiKeyChange }: SettingsModuleProps) {
  const [system, setSystem] = useState(state.settings.defaultSystemPrompt);
  const [webSearch, setWebSearch] = useState(state.settings.webSearch);
  const [includePrompt, setIncludePrompt] = useState(
    state.settings.includeVeniceSystemPrompt
  );
  const [webScraping, setWebScraping] = useState(state.settings.webScraping);
  const [webCitations, setWebCitations] = useState(state.settings.webCitations);
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // Desktop-only: API key entry
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyTesting, setApiKeyTesting] = useState(false);

  // Desktop-only: Updates
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);

  React.useEffect(() => {
    if (!isElectron()) return;

    const unsubs = [
      desktopUpdates.onUpdateAvailable((info: any) => {
        setUpdateStatus(`Update available: v${info?.version || "new"}`);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateNotAvailable(() => {
        setUpdateStatus("App is up to date.");
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onDownloadProgress((progress: any) => {
        setUpdateStatus(`Downloading update: ${Math.round(progress?.percent || 0)}%`);
      }),
      desktopUpdates.onUpdateDownloaded(() => {
        setUpdateStatus("Update downloaded and ready to install.");
        setUpdateDownloaded(true);
        setIsUpdateChecking(false);
      }),
      desktopUpdates.onUpdateError((err: string) => {
        setUpdateStatus(`Update error: ${err}`);
        setIsUpdateChecking(false);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  async function checkForUpdates() {
    setIsUpdateChecking(true);
    setUpdateStatus("Checking for updates...");
    const res = await desktopUpdates.checkForUpdates();
    if (!res.ok) {
      setUpdateStatus(`Update check failed: ${res.error}`);
      setIsUpdateChecking(false);
    }
  }

  async function installUpdate() {
    await desktopUpdates.installUpdate();
  }

  function confirm(message: string, detail: string, action: () => Promise<void> | void) {
    setPendingConfirm({ message, detail, onConfirm: action });
  }

  function saveDefaults() {
    dispatch({
      type: "SET_SETTINGS",
      settings: {
        defaultSystemPrompt: system,
        webSearch,
        includeVeniceSystemPrompt: includePrompt,
        webScraping,
        webCitations,
      },
    });
    setStatus("Settings saved.");
    setStatusError("");
  }

  async function clearSettings() {
    await StorageService.clearStore("settings");
    dispatch({ type: "SET_SETTINGS", settings: { ...state.settings, defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT } });
    setSystem(DEFAULT_SYSTEM_PROMPT);
    setWebSearch("off");
    setIncludePrompt(true);
    setWebScraping(false);
    setWebCitations(false);
    setStatus("Local settings cleared.");
    setStatusError("");
  }

  async function clearAllHistory() {
    confirm(
      "Delete all IndexedDB history?",
      "This will permanently delete all saved images, chats, and settings from local storage. This action cannot be undone.",
      async () => {
        await Promise.all(
          STORE_NAMES.map((store) => StorageService.clearStore(store))
        );
        dispatch({ type: "SET_GALLERY", items: [] });
        dispatch({ type: "SET_CHATS", items: [] });
        setStatus("IndexedDB history cleared.");
        setStatusError("");
      }
    );
  }

  // Desktop-only handlers
  async function saveApiKey() {
    if (!apiKeyInput.trim()) {
      setStatusError("Please enter a Venice API key.");
      return;
    }
    try {
      await desktopApiKey.set(apiKeyInput.trim());
      setApiKeyInput("");
      onApiKeyChange(true);
      setStatus("API key saved securely.");
      setStatusError("");
    } catch (err: any) {
      setStatusError(err.message || "Failed to save API key.");
    }
  }

  async function deleteApiKey() {
    confirm(
      "Delete the stored API key?",
      "The Venice API key will be removed from OS-level secure storage. You will need to re-enter it to use the app.",
      async () => {
        try {
          await desktopApiKey.delete();
          onApiKeyChange(false);
          setStatus("API key deleted.");
          setStatusError("");
        } catch (err: any) {
          setStatusError(err.message || "Failed to delete API key.");
        }
      }
    );
  }

  async function testApiKey() {
    setApiKeyTesting(true);
    setStatus("");
    setStatusError("");
    try {
      const result = await desktopApiKey.test();
      if (result.ok) {
        setStatus(`Connection successful${result.status ? ` (HTTP ${result.status})` : ""}.`);
      } else {
        setStatusError(`Connection failed: ${result.message}`);
      }
    } catch (err: any) {
      setStatusError(err.message || "Test failed.");
    } finally {
      setApiKeyTesting(false);
    }
  }

  async function exportData() {
    try {
      const [images, chats, settings] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
      ]);
      const appVersion = await desktopApp.getVersion();
      const payload = createExportPayload({ images, chats, settings }, appVersion);
      const ok = await desktopFiles.exportJson(
        payload,
        `venice-forge-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      if (ok) setStatus("Data exported.");
    } catch (err: any) {
      setStatusError(err.message || "Export failed.");
    }
  }

  async function importData() {
    try {
      const json = await desktopFiles.importJsonString();
      if (!json) return;
      const [imagesBefore, chatsBefore, settingsBefore] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
      ]);
      const backup = createExportPayload(
        { images: imagesBefore, chats: chatsBefore, settings: settingsBefore },
        await desktopApp.getVersion()
      );

      // Persist backup before any data is overwritten so it is recoverable.
      // Include time in the filename so multiple imports on the same day don't collide.
      const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const backupOk = await desktopFiles.exportJson(
        backup,
        `venice-forge-pre-import-backup-${dateTimeStr}.json`
      );
      if (!backupOk) {
        setStatusError("Pre-import backup could not be saved. Import aborted.");
        return;
      }

      const { payload, summary } = validateImportJson(json);

      for (const img of payload.data.images) await StorageService.saveItem("images", img);
      for (const chat of payload.data.chats) await StorageService.saveItem("chats", chat);
      for (const s of payload.data.settings) await StorageService.saveItem("settings", s);

      const [images, chats, settings] = await Promise.all([
        StorageService.getItems("images"),
        StorageService.getItems("chats"),
        StorageService.getItems("settings"),
      ]);
      dispatch({ type: "SET_GALLERY", items: images });
      dispatch({ type: "SET_CHATS", items: chats });
      const latestSettings = settings[0]?.value;
      if (latestSettings) dispatch({ type: "SET_SETTINGS", settings: latestSettings });

      setStatus(
        `Imported ${summary.imagesFound} images, ${summary.chatsFound} chats, ${summary.settingsFound} settings. ` +
          `${summary.skippedRecords} records skipped. Pre-import backup saved (${backup.data.images.length} images, ${backup.data.chats.length} chats).`
      );
    } catch (err: any) {
      setStatusError(err.message || "Import failed.");
    }
  }

  return (
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Settings</h2>
            <div className="text-sm text-zinc-400 mt-1">
              {isElectron() ? "Desktop app configuration and API key management." : "Client-side prototype defaults and key safety status."}
            </div>
          </div>
          {isElectron() ? (
            <Chip tone={apiKeyConfigured ? "ok" : "warn"}>
              {apiKeyConfigured ? "API key configured" : "No API key"}
            </Chip>
          ) : (
            <Chip tone="ok">{apiKeyConfigured ? "Local Key Active" : "API key Proxied"}</Chip>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* API key management */}
        {isElectron() ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Venice API Key</h3>
              <Chip tone={apiKeyConfigured ? "ok" : "warn"}>
                {apiKeyConfigured ? "Configured" : "Not set"}
              </Chip>
            </div>
            <div className="text-sm text-zinc-400 mb-6 bg-zinc-900/50 rounded-lg p-3 border border-white/5">
              Your key is stored using OS-level encryption (Windows DPAPI / macOS Keychain) and is never exposed to the renderer.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Enter Venice API key">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="vn-…"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </Field>
              <Field label="Actions">
                <div className="flex flex-wrap gap-3">
                  <button className="btn primary" onClick={saveApiKey} disabled={!apiKeyInput.trim()}>
                    Save key
                  </button>
                  <button className="btn" onClick={testApiKey} disabled={apiKeyTesting || !apiKeyConfigured}>
                    {apiKeyTesting ? "Testing…" : "Test connection"}
                  </button>
                  <button className="btn danger" onClick={deleteApiKey} disabled={!apiKeyConfigured}>
                    Delete key
                  </button>
                </div>
              </Field>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Venice API Key</h3>
              <Chip tone="ok">Server key</Chip>
            </div>
            <div className="text-sm text-zinc-400 bg-zinc-900/50 rounded-lg p-3 border border-white/5">
              Web mode uses the server .env key only. Manual local keys are desktop-only.
            </div>
          </div>
        )}

        {/* Application Updates (Desktop-only) */}
        {isElectron() && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Application Updates</h3>
              <Chip tone={updateDownloaded ? "ok" : "neutral"}>
                {updateDownloaded ? "Update Ready" : "System"}
              </Chip>
            </div>
            <div className="text-sm text-zinc-400 mb-6 bg-zinc-900/50 rounded-lg p-3 border border-white/5">
              Checks for updates securely via GitHub Releases.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Status">
                <div className="mt-2 text-sm text-zinc-300">
                  {updateStatus || "Idle"}
                </div>
              </Field>
              <Field label="Actions">
                <div className="flex flex-wrap gap-3">
                  <button className="btn" onClick={checkForUpdates} disabled={isUpdateChecking || updateDownloaded}>
                    {isUpdateChecking ? "Checking…" : "Check for updates"}
                  </button>
                  {updateDownloaded && (
                    <button className="btn primary" onClick={installUpdate}>
                      Restart and Install
                    </button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Default web search">
            <select
              value={webSearch}
              onChange={(e) => setWebSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="auto">auto</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Default chat model">
            <ModelSelect
              value={state.selectedChatModel}
              models={state.models.text}
              onChange={(model) =>
                dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })
              }
            />
          </Field>
          <Field label="Default image model">
            <ModelSelect
              value={state.selectedImageModel}
              models={state.models.image}
              onChange={(model) =>
                dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
              }
            />
          </Field>
        </div>

        {!isElectron() && (
          <Field label="Environment Defaults (.env.example)">
            <div className="relative group">
              <textarea
                readOnly
                rows={7}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-sm text-emerald-400 font-mono focus:outline-none resize-none"
                value={`VENICE_API_KEY="replace_with_your_venice_inference_key"\nMAX_PROXY_BODY_BYTES=26214400\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=60\nDISABLE_HMR=false\nPORT=3000`}
              />
              <button
                className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white rounded-md px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                onClick={() => {
                  navigator.clipboard.writeText(`VENICE_API_KEY="replace_with_your_venice_inference_key"\nMAX_PROXY_BODY_BYTES=26214400\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=60\nDISABLE_HMR=false\nPORT=3000`);
                  setStatus("Copied to clipboard!");
                }}
              >
                Copy
              </button>
            </div>
            <div className="text-xs text-zinc-500 mt-2">Only VENICE_API_KEY is sensitive. The other values are safe runtime defaults.</div>
          </Field>
        )}

        <Field label="Default system prompt">
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all min-h-[120px]"
          />
        </Field>

        <div className="flex flex-wrap gap-6 p-4 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={includePrompt}
              onChange={(e) => setIncludePrompt(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
            />
            <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Venice system prompt toggle</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={webScraping}
              onChange={(e) => setWebScraping(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
            />
            <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Web scraping default</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={webCitations}
              onChange={(e) => setWebCitations(e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
            />
            <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Web citations default</span>
          </label>
        </div>

        <StatusBlock success={status} error={statusError} />

        <div className="flex flex-wrap gap-3 pt-6 border-t border-white/5">
          <button className="btn primary" onClick={saveDefaults}>
            Save settings
          </button>
          <button className="btn" onClick={clearSettings}>
            Clear local settings
          </button>
          <button className="btn danger" onClick={clearAllHistory}>
            Clear IndexedDB history
          </button>
          {isElectron() && (
            <>
              <button className="btn" onClick={exportData}>
                Export data
              </button>
              <button className="btn" onClick={importData}>
                Import data
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!pendingConfirm}
        message={pendingConfirm?.message || ""}
        detail={pendingConfirm?.detail}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await pendingConfirm?.onConfirm();
            setPendingConfirm(null);
          } catch (err) {
            setStatusError(err instanceof Error ? err.message : "Operation failed");
            setPendingConfirm(null);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </section>
  );
}
