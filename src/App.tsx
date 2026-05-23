// Code Owner: fayeblade (@spearchucker667)
// Root application shell — all state, routing, and bridge initialization lives here.
import React, { useEffect, useReducer, useState } from "react";
import { appReducer, initialState } from "./state/appReducer";
import StorageService from "./services/storageService";
import { refreshModels } from "./services/modelService";
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
import { initDesktopBridge, isElectron, desktopApiKey } from "./services/desktopBridge";

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  // bridgeReady gates all initial API calls: in web mode it is true immediately
  // (bridge init is a no-op); in Electron it becomes true once preload diagnostics resolve.
  const [bridgeReady, setBridgeReady] = useState(!isElectron());
  const [firstRunRouted, setFirstRunRouted] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  // Network status listener
  useEffect(() => {
    const goOnline = () => dispatch({ type: "SET_ONLINE", online: true });
    const goOffline = () => dispatch({ type: "SET_ONLINE", online: false });
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Initialise the desktop bridge (no-op in web mode)
  useEffect(() => {
    let mounted = true;
    initDesktopBridge().then(() => {
      if (!mounted) return;
      setBridgeReady(true);
      if (isElectron()) {
        desktopApiKey.isConfigured().then(setApiKeyConfigured).catch(() => setApiKeyConfigured(false));
      }
    });
    return () => { mounted = false; };
  }, []);

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
        const latestSettings = settingsItems.find(i => i.id === "app-settings")?.value;
        if (latestSettings)
          dispatch({ type: "SET_SETTINGS", settings: latestSettings });
        
        if (!isElectron()) {
          // Web mode uses the server-side .env key; no local key check needed.
          setApiKeyConfigured(true);
        }
      } catch (err) {
        console.warn("IndexedDB init failed", err);
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: "Local storage (IndexedDB) could not be opened. History and gallery will not persist.",
            type: "error",
            duration: 8000,
          },
        });
      } finally {
        if (mounted) {
          setDbReady(true);
          setSettingsHydrated(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Gate initial model refresh until the proxy URL is resolved (critical in Electron)
  useEffect(() => {
    if (!bridgeReady) return;
    refreshModels(dispatch);
  }, [bridgeReady]);

  useEffect(() => {
    if (isElectron() && apiKeyConfigured === false && !firstRunRouted) {
      dispatch({ type: "SET_TAB", tab: "settings" });
      setFirstRunRouted(true);
    }
  }, [apiKeyConfigured, firstRunRouted]);

  useEffect(() => {
    if (!dbReady || !settingsHydrated) return;
    StorageService.saveItem("settings", {
      id: "app-settings",
      value: state.settings,
      timestamp: Date.now(),
    }).catch((err) => {
      console.warn("Settings save failed", err);
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: "Failed to save settings to local storage.",
          type: "error",
          duration: 5000,
        },
      });
    });
  }, [dbReady, settingsHydrated, state.settings]);

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
            {isElectron() ? (
              <Chip tone={apiKeyConfigured ? "ok" : "warn"} className="hide-mobile">
                {apiKeyConfigured ? "API key set" : "No API key"}
              </Chip>
            ) : (
              <Chip tone="ok" className="hide-mobile">Proxy Active</Chip>
            )}
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
            <div className="small">{isElectron() ? "IPC Transport" : "Proxy Active"}</div>
          </div>
        </aside>

        {/* Mobile Nav Rail */}
        <nav className="mobile-nav-rail hide-desktop">
          {TABS.map(([id, label]) => (
            <TabButton
              key={id}
              id={id}
              label={label}
              active={state.activeTab === id}
              onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
              className="compact"
              iconOnly
            />
          ))}
        </nav>

        <main className="workspace-content">
          <ErrorBoundary>
            {isElectron() && apiKeyConfigured === false && (
              <div className="notice small" style={{ marginBottom: 16 }}>
                Venice Forge needs a Venice API key before model, chat, and image requests can run. Add it in Config, then use Test connection.
              </div>
            )}
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
              <SettingsModule
                state={state}
                dispatch={dispatch}
                apiKeyConfigured={apiKeyConfigured}
                onApiKeyChange={setApiKeyConfigured}
              />
            )}
            {state.activeTab === "diagnostics" && (
              <DiagnosticsModule
                state={state}
                dispatch={dispatch}
                apiKeyConfigured={apiKeyConfigured}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>
      {!state.isOnline && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "12px 16px",
            background: "rgba(245, 158, 11, 0.9)",
            color: "#fff",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 -4px 20px rgba(245, 158, 11, 0.3)",
            textAlign: "center",
            fontSize: 13,
            fontFamily: "var(--display)",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            zIndex: 1000,
          }}
        >
          You are offline. API requests are unavailable until connectivity is restored.
        </div>
      )}
      <ToastHost state={state} dispatch={dispatch} />
    </div>
  );
}
