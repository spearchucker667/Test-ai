// Code Owner: fayeblade (@spearchucker667)
// Root application shell — all state, routing, and bridge initialization lives here.
import React, { useEffect, useReducer, useState } from "react";
import { appReducer, initialState } from "./state/appReducer";
import StorageService from "./services/storageService";
import { refreshModels } from "./services/modelService";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { useSettingsPersistence } from "./hooks/useSettingsPersistence";
import { useThemeLifecycle } from "./hooks/useThemeLifecycle";
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
import { initDesktopBridge, isElectron, desktopApiKey } from "./services/desktopBridge";
import { warn } from "./shared/logger";
import { GalleryImage } from "./types/storage";
import { listConversations, saveConversation, createConversation } from "./services/chatStorage";
import type { Conversation, ConversationMessage } from "./types/conversation";


type SettingsRecord = { id: string; timestamp: number; value?: Record<string, unknown> };

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  // bridgeReady gates all initial API calls: in web mode it is true immediately
  // (bridge init is a no-op); in Electron it becomes true once preload diagnostics resolve.
  const [bridgeReady, setBridgeReady] = useState(!isElectron());
  const [firstRunRouted, setFirstRunRouted] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);

  useThemeLifecycle(state.settings, settingsHydrated);
  useNetworkStatus(dispatch);

  // Initialise the desktop bridge (no-op in web mode)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initDesktopBridge();
        if (!mounted) return;
        if (isElectron()) {
          const configured = await desktopApiKey.isConfigured().catch(() => false);
          if (mounted) setApiKeyConfigured(configured);
        }
      } catch (err) {
        warn("Desktop bridge init failed", err);
        if (!mounted) return;
        if (isElectron()) setApiKeyConfigured(false);
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: "Desktop bridge diagnostics failed. Continuing with degraded startup checks.",
            type: "warn",
            duration: 7000,
          },
        });
      } finally {
        if (mounted) {
          setBridgeReady(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await StorageService.openDB();
        const [imagesResult, chatsResult, settingsResult] = await Promise.all([
          StorageService.getItemsWithMeta("images"),
          StorageService.getItemsWithMeta("chats"),
          StorageService.getItemsWithMeta("settings"),
        ]);
        const images = imagesResult.items as GalleryImage[];
        const chats = chatsResult.items as import("./types/storage").ChatHistoryItem[];
        const settingsItems = settingsResult.items as SettingsRecord[];
        const totalDecryptFailures =
          imagesResult.decryptFailures + chatsResult.decryptFailures + settingsResult.decryptFailures;
        if (!mounted) return;
        dispatch({ type: "SET_GALLERY", items: images });
        dispatch({ type: "SET_CHATS", items: chats });
        const latestSettings = settingsItems.find(i => i.id === "app-settings")?.value;
        if (latestSettings)
          dispatch({ type: "SET_SETTINGS", settings: latestSettings });

        // Load conversations (Electron filesystem or IndexedDB fallback)
        let conversations = await listConversations();

        // Migrate old flat chat history into a default conversation if none exist yet
        if (conversations.length === 0 && chats.length > 0) {
          const lastChat = chats.reduce((latest, c) => (c.timestamp > latest.timestamp ? c : latest), chats[0]);
          const migrated = createConversation(
            lastChat?.model || state.selectedChatModel,
            (latestSettings as Record<string, unknown>)?.defaultSystemPrompt as string || ""
          );
          migrated.title = "Migrated History";
          migrated.messages = chats
            .sort((a, b) => a.timestamp - b.timestamp)
            .flatMap((c) => {
              const msgs: ConversationMessage[] = [];
              if (c.prompt) msgs.push({ id: crypto.randomUUID(), role: "user", content: c.prompt, timestamp: c.timestamp });
              if (c.response) msgs.push({ id: crypto.randomUUID(), role: "assistant", content: c.response, timestamp: c.timestamp });
              return msgs;
            });
          migrated.updatedAt = Date.now();
          if (migrated.messages.length > 0) {
            await saveConversation(migrated);
            conversations = [migrated];
            dispatch({
              type: "ADD_TOAST",
              toast: {
                id: crypto.randomUUID(),
                message: `Migrated ${chats.length} chat record(s) into a new conversation.`,
                type: "info",
                duration: 6000,
              },
            });
          }
        }

        dispatch({ type: "SET_CONVERSATIONS", items: conversations });
        if (conversations.length > 0 && !state.activeConversationId) {
          dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conversations[0].id });
        }

        if (totalDecryptFailures > 0) {
          dispatch({
            type: "ADD_TOAST",
            toast: {
              id: crypto.randomUUID(),
              message:
                `${totalDecryptFailures} local record(s) could not be decrypted and were skipped. ` +
                "This can happen after key-store or profile changes.",
              type: "warn",
              duration: 9000,
            },
          });
        }
        
        if (!isElectron()) {
          // Web mode uses the server-side .env key; no local key check needed.
          setApiKeyConfigured(true);
        }

        if (mounted) {
          setDbReady(true);
          setSettingsHydrated(true);
        }
      } catch (err) {
        warn("IndexedDB init failed", err);
        dispatch({
          type: "ADD_TOAST",
          toast: {
            id: crypto.randomUUID(),
            message: "Local storage (IndexedDB) could not be opened. History and gallery will not persist.",
            type: "error",
            duration: 8000,
          },
        });
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

  useSettingsPersistence(state.settings, dbReady, settingsHydrated, dispatch);

  return (
    <div className="flex h-screen flex-col bg-transparent">
      {/* Header */}
      <header className="relative z-20 flex h-16 items-center border-b border-border/50 bg-bg/70 px-6 backdrop-blur-xl after:absolute after:-bottom-px after:left-0 after:right-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-accent/50 after:to-transparent">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <img
              src="/assets/branding/venice-keys-red.svg"
              alt="Venice"
              className="h-9 w-9 shrink-0"
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
            />
            <div>
              <div className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-text-primary [text-shadow:0_0_16px_var(--glow)]">
                Venice Forge
              </div>
              <div className="mt-0.5 hidden font-sans text-xs font-medium text-text-muted sm:block">
                Private AI creation studio
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {isElectron() ? (
              <Chip tone={apiKeyConfigured ? "ok" : "warn"} className="hidden md:inline-flex">
                {apiKeyConfigured ? "API key set" : "No API key"}
              </Chip>
            ) : (
              <Chip tone="ok" className="hidden md:inline-flex">Proxy Active</Chip>
            )}
            <Chip tone={state.usingFallbackModels ? "warn" : "ok"} className="hidden md:inline-flex">
              {state.usingFallbackModels ? "Fallback models" : "Live Models"}
            </Chip>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-transparent bg-transparent px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-border hover:bg-surface-elevated"
              onClick={() => dispatch({ type: "SET_TAB", tab: "diagnostics" })}
              title="System Status"
            >
              Status
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden w-[280px] min-w-[280px] flex-col justify-between border-r border-border/50 bg-bg/40 p-4 backdrop-blur-md lg:flex">
          <div className="mb-4 px-2">
            <img
              src="/assets/branding/venice-logo-lockup-red.svg"
              alt="Venice Forge"
              className="h-8 w-auto"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
            />
          </div>
          <nav className="flex flex-col gap-2">
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
          <div className="rounded-xl border border-border/50 bg-surface/60 p-4 shadow-lg backdrop-blur-md">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">System</div>
            <div className="mt-1 text-xs text-text-secondary">{isElectron() ? "IPC Transport" : "Proxy Active"}</div>
          </div>
        </aside>

        {/* Mobile Nav Rail (tablet width) */}
        <nav className="hidden w-20 min-w-[80px] flex-col items-center gap-3 border-r border-border/50 bg-bg/70 py-4 backdrop-blur-xl md:flex lg:hidden overflow-y-auto">
          <div className="mb-2 px-2">
            <img
              src="/assets/branding/venice-keys-red.svg"
              alt="Venice"
              className="h-8 w-8"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
            />
          </div>
          {TABS.map(([id, label]) => (
            <TabButton
              key={id}
              id={id}
              label={label}
              active={state.activeTab === id}
              onClick={(tab) => dispatch({ type: "SET_TAB", tab })}
              className="h-16 w-16 !p-2"
              iconOnly
            />
          ))}
        </nav>

        {/* Workspace Content */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-transparent">
          <ErrorBoundary>
            {isElectron() && apiKeyConfigured === false && (
              <div className="m-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-relaxed text-warning shadow-sm">
                Venice Forge needs a Venice API key before model, chat, and image requests can run. Add it in Config, then use Test connection.
              </div>
            )}
            
            {/* Mobile horizontal tabs (small screens only) */}
            <nav className="sticky top-0 z-10 flex gap-3 overflow-x-auto border-b border-border/50 bg-bg/80 p-4 backdrop-blur-xl md:hidden">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => dispatch({ type: "SET_TAB", tab: id })}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    state.activeTab === id 
                      ? "bg-accent/20 text-accent-fg border border-accent/30" 
                      : "bg-transparent text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            {state.activeTab === "chat" && <ChatModule state={state} dispatch={dispatch} />}
            {state.activeTab === "image" && <ImageModule state={state} dispatch={dispatch} />}
            {state.activeTab === "batch" && <BatchModule state={state} dispatch={dispatch} />}
            {state.activeTab === "search" && <SearchScrapeModule state={state} dispatch={dispatch} />}
            {state.activeTab === "models" && <ModelsModule state={state} dispatch={dispatch} />}
            {state.activeTab === "gallery" && <GalleryModule state={state} dispatch={dispatch} />}
            {state.activeTab === "settings" && (
              <SettingsModule state={state} dispatch={dispatch} apiKeyConfigured={apiKeyConfigured} onApiKeyChange={setApiKeyConfigured} />
            )}
            {state.activeTab === "diagnostics" && (
              <DiagnosticsModule state={state} dispatch={dispatch} apiKeyConfigured={apiKeyConfigured} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Offline Banner */}
      {!state.isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-0 left-0 right-0 z-[1000] bg-warning/90 px-4 py-3 text-center font-display text-[13px] font-bold uppercase tracking-widest text-accent-fg shadow-[0_-4px_20px_var(--glow)] backdrop-blur-xl"
        >
          You are offline. API requests are unavailable until connectivity is restored.
        </div>
      )}
      <ToastHost state={state} dispatch={dispatch} />
    </div>
  );
}
