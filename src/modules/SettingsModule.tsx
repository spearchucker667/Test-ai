import React, { useState } from "react";
import StorageService from "../services/storageService";
import { STORE_NAMES, DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { Field } from "../components/Field";
import { Chip } from "../components/Chip";
import { ModelSelect } from "../components/ModelSelect";
import { StatusBlock } from "../components/StatusBlock";
import { isElectron, desktopApiKey, desktopFiles } from "../services/desktopBridge";

interface SettingsModuleProps {
  state: any;
  dispatch: any;
  apiKeyConfigured: boolean | null;
  onApiKeyChange: (configured: boolean) => void;
}

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

  // Desktop-only: API key entry
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyTesting, setApiKeyTesting] = useState(false);

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
    await Promise.all(
      STORE_NAMES.map((store) => StorageService.clearStore(store))
    );
    dispatch({ type: "SET_GALLERY", items: [] });
    dispatch({ type: "SET_CHATS", items: [] });
    setStatus("IndexedDB history cleared.");
    setStatusError("");
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
    try {
      await desktopApiKey.delete();
      onApiKeyChange(false);
      setStatus("API key deleted.");
      setStatusError("");
    } catch (err: any) {
      setStatusError(err.message || "Failed to delete API key.");
    }
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
      const ok = await desktopFiles.exportJson(
        { exportedAt: new Date().toISOString(), images, chats, settings },
        "venice-forge-export.json"
      );
      if (ok) setStatus("Data exported.");
    } catch (err: any) {
      setStatusError(err.message || "Export failed.");
    }
  }

  async function importData() {
    try {
      const data = await desktopFiles.importJson() as any;
      if (!data) return;
      if (Array.isArray(data.images)) {
        for (const img of data.images) await StorageService.saveItem("images", img);
        const items = await StorageService.getItems("images");
        dispatch({ type: "SET_GALLERY", items });
      }
      if (Array.isArray(data.chats)) {
        for (const chat of data.chats) await StorageService.saveItem("chats", chat);
        const items = await StorageService.getItems("chats");
        dispatch({ type: "SET_CHATS", items });
      }
      if (Array.isArray(data.settings)) {
        for (const s of data.settings) await StorageService.saveItem("settings", s);
        const latestSettings = data.settings[0]?.value;
        if (latestSettings) dispatch({ type: "SET_SETTINGS", settings: latestSettings });
      }
      setStatus("Data imported successfully.");
    } catch (err: any) {
      setStatusError(err.message || "Import failed.");
    }
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Settings</h2>
          <div className="small muted">
            {isElectron() ? "Desktop app configuration and API key management." : "Client-side prototype defaults and key safety status."}
          </div>
        </div>
        {isElectron() ? (
          <Chip tone={apiKeyConfigured ? "ok" : "warn"}>
            {apiKeyConfigured ? "API key configured" : "No API key"}
          </Chip>
        ) : (
          <Chip tone="ok">API key Proxied</Chip>
        )}
      </div>

      <div className="body grid">

        {/* Desktop: API key management */}
        {isElectron() && (
          <div className="panel pad">
            <div className="panel-header">
              <div className="panel-title">Venice API Key</div>
              <Chip tone={apiKeyConfigured ? "ok" : "warn"}>
                {apiKeyConfigured ? "Configured" : "Not set"}
              </Chip>
            </div>
            <div className="notice small">
              Your key is stored using OS-level encryption (Windows DPAPI / macOS Keychain) and is never exposed to the renderer.
            </div>
            <div className="grid two" style={{ marginTop: 12 }}>
              <Field label="Enter Venice API key">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="vn-…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <Field label="Actions">
                <div className="chip-row">
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
        )}

        {/* Web mode notice */}
        {!isElectron() && (
          <div className="notice small">
            Production mode: Venice API calls are proxied through the server so the API key is not exposed in browser code.
          </div>
        )}

        <div className="grid two">
          {!isElectron() && (
            <Field label="API key status">
              <input readOnly value="Proxy handles Authorization" />
            </Field>
          )}
          <Field label="Default web search">
            <select
              value={webSearch}
              onChange={(e) => setWebSearch(e.target.value)}
            >
              <option value="off">off</option>
              <option value="on">on</option>
              <option value="auto">auto</option>
            </select>
          </Field>
        </div>

        <div className="grid two">
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
            <div style={{ position: "relative" }}>
              <textarea
                readOnly
                rows={7}
                style={{ fontFamily: 'monospace' }}
                value={`VENICE_API_KEY="replace_with_your_venice_inference_key"\nMAX_PROXY_BODY_BYTES=26214400\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=60\nDISABLE_HMR=false\nPORT=3000`}
              />
              <button
                className="btn sm"
                style={{ position: "absolute", top: 8, right: 8, minHeight: 32 }}
                onClick={() => {
                  navigator.clipboard.writeText(`VENICE_API_KEY="replace_with_your_venice_inference_key"\nMAX_PROXY_BODY_BYTES=26214400\nRATE_LIMIT_WINDOW_MS=60000\nRATE_LIMIT_MAX_REQUESTS=60\nDISABLE_HMR=false\nPORT=3000`);
                  setStatus("Copied to clipboard!");
                }}
              >
                Copy
              </button>
            </div>
            <div className="small muted">Only VENICE_API_KEY is sensitive. The other values are safe runtime defaults.</div>
          </Field>
        )}

        <Field label="Default system prompt">
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
          />
        </Field>

        <div className="chip-row">
          <label className="switch">
            <input
              type="checkbox"
              checked={includePrompt}
              onChange={(e) => setIncludePrompt(e.target.checked)}
            />{" "}
            Venice system prompt toggle
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={webScraping}
              onChange={(e) => setWebScraping(e.target.checked)}
            />{" "}
            Web scraping default
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={webCitations}
              onChange={(e) => setWebCitations(e.target.checked)}
            />{" "}
            Web citations default
          </label>
        </div>

        <StatusBlock success={status} error={statusError} />

        <div className="chip-row">
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
    </section>
  );
}
