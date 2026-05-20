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
import { ToastHost } from "./components/ToastHost";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo">V</div>
            <div>
              <div className="brand-title">Venice Forge</div>
              <div className="brand-subtitle">Private AI creation studio</div>
            </div>
          </div>
          <div className="header-actions">
            <Chip tone="ok" className="hide-mobile">Proxy Active</Chip>
            <Chip tone={state.usingFallbackModels ? "warn" : "ok"} className="hide-mobile">
              {state.usingFallbackModels ? "Fallback models" : "Live Models"}
            </Chip>
            <button
              className="btn ghost sm"
              onClick={() => dispatch({ type: "SET_TAB", tab: "diagnostics" })}
              title="System Status"
            >
              Status
            </button>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className="vertical-nav hide-mobile">
          <nav className="nav-group">
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
          <div className="status-rail-card">
            <div className="tiny muted">System</div>
            <div className="small">Proxy Active</div>
          </div>
        </aside>

        {/* Mobile Nav Rail */}
        <nav className="mobile-nav-rail hide-desktop">
          {TABS.map(([id, label]) => (
            <TabButton
              key={id}
              id={id}
              label={label.slice(0, 3)} // Short label or use icons if available
              active={state.activeTab === id}
              onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
              className="compact"
            />
          ))}
        </nav>

        <main className="workspace-content">
          <ErrorBoundary>
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
          </ErrorBoundary>
        </main>
      </div>
      <ToastHost state={state} dispatch={dispatch} />
    </div>
  );
}
