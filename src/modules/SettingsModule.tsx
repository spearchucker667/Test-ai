import React, { useState } from "react";
import StorageService from "../services/storageService";
import { STORE_NAMES, DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { Field } from "../components/Field";
import { Chip } from "../components/Chip";
import { ModelSelect } from "../components/ModelSelect";
import { StatusBlock } from "../components/StatusBlock";

export function SettingsModule({ state, dispatch }: { state: any; dispatch: any }) {
  const [system, setSystem] = useState(state.settings.defaultSystemPrompt);
  const [webSearch, setWebSearch] = useState(state.settings.webSearch);
  const [includePrompt, setIncludePrompt] = useState(
    state.settings.includeVeniceSystemPrompt
  );
  const [webScraping, setWebScraping] = useState(state.settings.webScraping);
  const [webCitations, setWebCitations] = useState(state.settings.webCitations);
  const [status, setStatus] = useState("");

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
    setStatus("Settings saved locally in IndexedDB.");
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
  }

  async function clearAllHistory() {
    await Promise.all(
      STORE_NAMES.map((store) => StorageService.clearStore(store))
    );
    dispatch({ type: "SET_GALLERY", items: [] });
    dispatch({ type: "SET_CHATS", items: [] });
    setStatus("IndexedDB history cleared.");
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Settings</h2>
          <div className="small muted">
            Client-side prototype defaults and key safety status.
          </div>
        </div>
        <Chip tone="ok">API key Proxied</Chip>
      </div>

      <div className="body grid">
        <div className="notice small">
          Production mode: Venice API calls are proxied through the server so the API key is not exposed in browser code.
        </div>

        <div className="grid two">
          <Field label="API key status">
            <input
              readOnly
              value={"Proxy handles Authorization"}
            />
          </Field>
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

        <Field label="Default system prompt">
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
          />
        </Field>

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

        <StatusBlock success={status} />

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
        </div>
      </div>
    </section>
  );
}
