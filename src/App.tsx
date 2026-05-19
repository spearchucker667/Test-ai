import React, { useEffect, useReducer } from "react";
import { appReducer, initialState } from "./state/appReducer";
import StorageService from "./services/storageService";
import { refreshModels } from "./modules/ModelsModule";
import { ChatModule } from "./modules/ChatModule";
import { ImageModule } from "./modules/ImageModule";
import { BatchModule } from "./modules/BatchModule";
import { SearchScrapeModule } from "./modules/SearchScrapeModule";
import { ModelsModule } from "./modules/ModelsModule";
import { GalleryModule } from "./modules/GalleryModule";
import { SettingsModule } from "./modules/SettingsModule";
import { DiagnosticsModule } from "./modules/DiagnosticsModule";
import { TABS } from "./constants/venice";
import { Chip } from "./components/Chip";
import { TabButton } from "./components/TabButton";
import { DiagPreview } from "./components/DiagnosticsPreview";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await StorageService.openDB();
        const [images, chats, settingsItems] = await Promise.all([
          StorageService.getItems("images"),
          StorageService.getItems("chats"),
          StorageService.getItems("settings"),
        ]);
        if (!mounted) return;
        dispatch({ type: "SET_GALLERY", items: images });
        dispatch({ type: "SET_CHATS", items: chats });
        const latestSettings = settingsItems[0]?.value;
        if (latestSettings)
          dispatch({ type: "SET_SETTINGS", settings: latestSettings });
      } catch (err) {
        console.warn("IndexedDB init failed", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    refreshModels(dispatch);
  }, []);

  useEffect(() => {
    StorageService.saveItem("settings", {
      id: "app-settings",
      value: state.settings,
      timestamp: Date.now(),
    }).catch(() => {});
  }, [state.settings]);

  const activeLabel =
    TABS.find(([id]) => id === state.activeTab)?.[1] || "Chat";

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo">V</div>
            <div>
              <div className="brand-title">Venice Forge</div>
              <div className="brand-subtitle">
                Private AI creation studio
              </div>
            </div>
          </div>
          <div className="header-actions">
            <Chip tone="ok" className="hide-mobile">proxy active</Chip>
            <Chip tone={state.usingFallbackModels ? "warn" : "ok"} className="hide-mobile">
              {state.usingFallbackModels ? "fallback models" : "live models"}
            </Chip>
            <button
              className="btn ghost"
              onClick={() => dispatch({ type: "SET_TAB", tab: "diagnostics" })}
              title="System Status"
            >
              Status
            </button>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="panel pad" style={{ flex: 1, borderBottom: 'none' }}>
            <nav className="tabs">
              {TABS.map(([id, label]) => (
                <TabButton
                  key={id}
                  id={id}
                  label={label}
                  active={state.activeTab === id}
                  onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
                />
              ))}
            </nav>
          </div>
        </aside>

        <main className="main">
          <nav className="mobile-tabs">
            {TABS.map(([id, label]) => (
              <TabButton
                key={id}
                id={id}
                label={label}
                active={state.activeTab === id}
                onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
              />
            ))}
          </nav>

          {state.activeTab === "chat" && (
            <ChatModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "image" && (
            <ImageModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "batch" && (
            <BatchModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "search" && (
            <SearchScrapeModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "models" && (
            <ModelsModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "gallery" && (
            <GalleryModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "settings" && (
            <SettingsModule state={state} dispatch={dispatch} />
          )}
          {state.activeTab === "diagnostics" && (
            <DiagnosticsModule state={state} dispatch={dispatch} />
          )}
        </main>
      </div>
    </div>
  );
}
