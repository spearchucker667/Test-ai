import React, { useState, useRef, useEffect, useCallback } from "react";
import { veniceFetch, veniceStreamChat } from "../services/veniceClient";
import { DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { Markdown } from "../utils/markdown";
import { copyText } from "../utils/download";
import { buildChatPayload } from "../utils/payloadBuilders";
import { isValidChatResponse } from "../utils/veniceValidation";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { ModelRefreshButton } from "../components/ModelRefreshButton";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { StatusBlock } from "../components/StatusBlock";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ConfirmModal } from "../components/ConfirmModal";
import { ModuleProps } from "../types/app";
import type { Conversation, ConversationMessage } from "../types/conversation";
import {
  createConversation,
  saveConversation,
  deleteConversation,
  deriveTitle,
} from "../services/chatStorage";

interface ChatUiMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
}

export function ChatModule({ state, dispatch }: ModuleProps) {
  const conversations = state.conversations;
  const activeId = state.activeConversationId;

  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  const [systemPrompt, setSystemPrompt] = useState(
    activeConversation?.systemPrompt ?? state.settings.defaultSystemPrompt
  );
  const [userPrompt, setUserPrompt] = useState("");
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [webSearch, setWebSearch] = useState(state.settings.webSearch);
  const [webScraping, setWebScraping] = useState(state.settings.webScraping);
  const [webCitations, setWebCitations] = useState(state.settings.webCitations);
  const [includeVeniceSystemPrompt, setIncludeVeniceSystemPrompt] = useState(
    state.settings.includeVeniceSystemPrompt
  );
  const [characterSlug, setCharacterSlug] = useState("");
  const [stream, setStream] = useState(false);
  const [enableXSearch, setEnableXSearch] = useState(false);
  const [stripThinking, setStripThinking] = useState(false);
  const [disableThinking, setDisableThinking] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Sync local messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      setMessages(
        activeConversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      );
      setSystemPrompt(activeConversation.systemPrompt || state.settings.defaultSystemPrompt);
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Ready. Send a prompt to call Venice /chat/completions.",
        },
      ]);
      setSystemPrompt(state.settings.defaultSystemPrompt);
    }
  }, [activeId, state.settings.defaultSystemPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    setSystemPrompt(state.settings.defaultSystemPrompt);
    setWebSearch(state.settings.webSearch);
    setWebScraping(state.settings.webScraping);
    setWebCitations(state.settings.webCitations);
    setIncludeVeniceSystemPrompt(state.settings.includeVeniceSystemPrompt);
  }, [
    state.settings.defaultSystemPrompt,
    state.settings.webSearch,
    state.settings.webScraping,
    state.settings.webCitations,
    state.settings.includeVeniceSystemPrompt,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ensureActiveConversation = useCallback(async (): Promise<Conversation> => {
    if (activeConversation) return activeConversation;
    const conv = createConversation(state.selectedChatModel, systemPrompt || DEFAULT_SYSTEM_PROMPT);
    conv.model = state.selectedChatModel;
    await saveConversation(conv);
    const updated = [...conversations, conv];
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
    return conv;
  }, [activeConversation, conversations, dispatch, state.selectedChatModel, systemPrompt]);

  const persistMessages = useCallback(
    async (conv: Conversation, newMessages: ChatUiMessage[]) => {
      const updated: Conversation = {
        ...conv,
        messages: newMessages.map((m): ConversationMessage => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: Date.now(),
        })),
        updatedAt: Date.now(),
        model: state.selectedChatModel,
        systemPrompt,
        title: conv.title === "New Chat" ? deriveTitle(newMessages) : conv.title,
      };
      await saveConversation(updated);
      const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
      dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    },
    [dispatch, state.conversations, state.selectedChatModel, systemPrompt]
  );

  async function send() {
    const trimmedPrompt = userPrompt.trim();
    if (!trimmedPrompt || loading) {
      if (!trimmedPrompt) setPromptTouched(true);
      return;
    }
    setPromptTouched(false);
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    setError("");
    setLoading(true);
    const runId = ++runIdRef.current;

    const conv = await ensureActiveConversation();

    const userMessage: ChatUiMessage = { id: crypto.randomUUID(), role: "user", content: trimmedPrompt };
    const conversation = [
      { role: "system" as const, content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...messages.filter((m) => ["user", "assistant"].includes(m.role)),
      userMessage,
    ];
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: crypto.randomUUID(), role: "assistant", content: "" } as ChatUiMessage,
    ]);
    setUserPrompt("");

    const payload = buildChatPayload(
      state.selectedChatModel,
      conversation,
      {
        includeVeniceSystemPrompt,
        webSearch,
        webScraping,
        webCitations,
      },
      {
        stream,
        characterSlug,
        reasoningEffort,
        enableXSearch,
        stripThinking,
        disableThinking,
      }
    );

    abortRef.current = new AbortController();

    try {
      if (stream) {
        let acc = "";
        await veniceStreamChat(payload, {
          signal: abortRef.current.signal,
          dispatch,
          onDelta: (delta: string) => {
            acc += delta;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { ...next[next.length - 1], role: "assistant", content: acc };
              return next;
            });
          },
        });
        if (runIdRef.current !== runId) return;
        setMessages((prev) => {
          const next = [...prev];
          persistMessages(conv, next);
          return next;
        });
      } else {
        const { data } = await veniceFetch("/chat/completions", {
          method: "POST",
          body: payload,
          signal: abortRef.current.signal,
          dispatch,
        });
        if (!isValidChatResponse(data)) {
          throw new Error("Invalid chat response from server.");
        }
        const content =
          data.choices[0]?.message?.content ||
          data.choices[0]?.text ||
          "";
        setMessages((prev) => {
          if (runIdRef.current !== runId) return prev;
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: "assistant", content };
          persistMessages(conv, next);
          return next;
        });
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") {
        setError(error.message || "Chat request failed");
      }
      setMessages((prev) => {
        if (runIdRef.current !== runId) return prev;
        const next = [...prev];
        if (
          next[next.length - 1]?.role === "assistant" &&
          !next[next.length - 1].content
        ) {
          next.pop();
          if (next[next.length - 1]?.role === "user") {
            next.pop();
          }
        }
        persistMessages(conv, next);
        return next;
      });
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
      }
    }
  }

  function cancel() {
    runIdRef.current++;
    abortRef.current?.abort();
    setLoading(false);
  }

  async function clear() {
    setMessages([]);
    setError("");
    if (activeConversation) {
      const updated: Conversation = { ...activeConversation, messages: [], updatedAt: Date.now() };
      await saveConversation(updated);
      const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
      dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    }
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Conversation cleared.", type: "info" } });
  }

  async function handleNewChat() {
    const conv = createConversation(state.selectedChatModel, systemPrompt || DEFAULT_SYSTEM_PROMPT);
    conv.model = state.selectedChatModel;
    await saveConversation(conv);
    const updated = [conv, ...state.conversations];
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Ready. Send a prompt to call Venice /chat/completions.",
      },
    ]);
  }

  async function handleSwitchConversation(id: string) {
    if (activeConversation && messages.length > 0) {
      await persistMessages(activeConversation, messages);
    }
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id });
  }

  async function handleDeleteConversation(conv: Conversation) {
    await deleteConversation(conv.id);
    const updated = state.conversations.filter((c) => c.id !== conv.id);
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    if (activeId === conv.id) {
      dispatch({ type: "SET_ACTIVE_CONVERSATION", id: updated[0]?.id ?? null });
    }
    setDeleteTarget(null);
  }

  async function handleRenameSubmit(conv: Conversation) {
    const title = renameValue.trim() || conv.title;
    const updated: Conversation = { ...conv, title, updatedAt: Date.now() };
    await saveConversation(updated);
    const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
    dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    setRenamingId(null);
    setRenameValue("");
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);

  return (
    <section className="flex h-full bg-bg">
      {/* Conversation sidebar */}
      <aside className="w-64 min-w-[16rem] border-r border-border/50 bg-bg/40 flex flex-col">
        <div className="p-4 border-b border-border/50">
          <button
            className="w-full btn primary text-sm"
            onClick={handleNewChat}
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-accent/20 border border-accent/30"
                    : "hover:bg-surface-elevated/60 border border-transparent"
                }`}
                onClick={() => handleSwitchConversation(conv.id)}
              >
                {renamingId === conv.id ? (
                  <input
                    autoFocus
                    className="flex-1 min-w-0 bg-surface/60 border border-border/50 rounded px-2 py-1 text-sm text-text-primary"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(conv)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(conv);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1 min-w-0 truncate text-sm font-medium text-text-primary"
                      onDoubleClick={() => {
                        setRenamingId(conv.id);
                        setRenameValue(conv.title);
                      }}
                      title={conv.title}
                    >
                      {conv.title}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity text-xs px-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv);
                      }}
                      title="Delete"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 px-3 py-8 text-center">
              <img
                src="/assets/branding/venice-keys-red.svg"
                alt=""
                className="h-10 w-10 opacity-20"
                aria-hidden="true"
              />
              <div className="text-sm text-text-muted">
                No conversations yet.
                <br />
                Start a new chat to begin.
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-none p-6 border-b border-border/50 bg-bg/50 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Chat</h2>
              <div className="text-sm text-text-secondary mt-1">
                POST /chat/completions, non-streaming by default.
              </div>
            </div>
            <DiagPreview diagnostics={state.diagnostics} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 min-h-0">
          <CollapsibleSection title="Model & Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
              <Field label="Model">
                <ModelSelect
                  value={state.selectedChatModel}
                  models={state.models.text}
                  onChange={(model) =>
                    dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })
                  }
                />
              </Field>
              <Field label="Optional character_slug">
                <input
                  value={characterSlug}
                  onChange={(e) => setCharacterSlug(e.target.value)}
                  placeholder="alan-watts"
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                />
              </Field>
            </div>

            <div className="mt-4 p-1">
              <ModelRefreshButton state={state} dispatch={dispatch} />
            </div>

            <div className="mt-6 p-1">
              <Field label="System prompt">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all min-h-[80px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 p-1">
              <Field label="Web search">
                <select
                  value={webSearch}
                  onChange={(e) => setWebSearch(e.target.value)}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                  <option value="auto">auto</option>
                </select>
              </Field>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Venice parameters</label>
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-surface-elevated/40 backdrop-blur-sm">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={webScraping}
                      onChange={(e) => setWebScraping(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Web scraping</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={webCitations}
                      onChange={(e) => setWebCitations(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Citations</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Response mode</label>
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-surface-elevated/40 backdrop-blur-sm">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={includeVeniceSystemPrompt}
                      onChange={(e) => setIncludeVeniceSystemPrompt(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Include Venice system prompt</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={stream}
                      onChange={(e) => setStream(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Stream response</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 p-1">
              <Field label="Reasoning effort">
                <select
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value)}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                >
                  <option value="">(model default)</option>
                  <option value="none">none</option>
                  <option value="minimal">minimal</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="xhigh">xhigh</option>
                  <option value="max">max</option>
                </select>
              </Field>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Reasoning / thinking</label>
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-surface-elevated/40 backdrop-blur-sm">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={stripThinking}
                      onChange={(e) => setStripThinking(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Strip &lt;think&gt; blocks</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={disableThinking}
                      onChange={(e) => setDisableThinking(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">Disable thinking</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Grok / xAI</label>
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-surface-elevated/40 backdrop-blur-sm">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={enableXSearch}
                      onChange={(e) => setEnableXSearch(e.target.checked)}
                      className="w-4 h-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">xAI web + X search</span>
                  </label>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2" aria-live="polite">
            {messages.map((m, idx) => (
              <div key={m.id || `${m.role}-${m.content?.slice(0, 8)}`} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm backdrop-blur-md ${
                  m.role === 'user'
                    ? 'bg-accent text-text-primary rounded-tr-sm'
                    : 'bg-surface-elevated border border-border/50 text-text-primary rounded-tl-sm shadow-[0_4px_24px_var(--overlay)]'
                }`}>
                  <div className={`flex items-center gap-2 mb-2 text-xs font-semibold tracking-wider uppercase ${m.role === 'user' ? 'text-accent' : 'text-accent'}`}>
                    <span>{m.role}</span>
                    {m.role === "assistant" && idx === messages.length - 1 && loading && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce"></span>
                      </span>
                    )}
                  </div>
                  <div className="prose prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-pre:bg-surface/60 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl">
                    <Markdown
                      text={
                        m.content ||
                        (loading && idx === messages.length - 1 ? "" : "")
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef}></div>
          </div>

          <StatusBlock error={error} />

          <div className="pt-2">
            <Field label="User prompt">
              <textarea
                aria-label="User prompt"
                value={userPrompt}
                onChange={(e) => {
                  setUserPrompt(e.target.value);
                  if (promptTouched && e.target.value.trim()) setPromptTouched(false);
                }}
                placeholder="Ask Venice something…"
                aria-invalid={promptTouched && !userPrompt.trim()}
                aria-describedby="chat-prompt-error"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
                }}
                className="w-full bg-surface/50 border border-border/50 rounded-xl px-5 py-4 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all min-h-[100px] resize-y shadow-inner"
              />
              {promptTouched && !loading && !userPrompt.trim() && (
                <div id="chat-prompt-error" className="mt-2 text-sm text-danger" role="alert">
                  Please enter a prompt before sending.
                </div>
              )}
            </Field>
          </div>

          <div className="flex flex-wrap gap-3 pb-4">
            <button
              className="btn primary"
              onClick={send}
              disabled={loading}
              aria-disabled={loading || !userPrompt.trim()}
            >
              Send
            </button>
            <button className="btn" onClick={cancel} disabled={!loading}>
              Cancel
            </button>
            <button className="btn" onClick={clear}>
              Clear conversation
            </button>
            <button
              className="btn"
              onClick={() => copyText(lastAssistant?.content || "")}
              disabled={!lastAssistant?.content}
            >
              Copy response
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          open={!!deleteTarget}
          message="Delete conversation"
          detail={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDeleteConversation(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
