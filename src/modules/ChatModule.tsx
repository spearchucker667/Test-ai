import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
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

export function ChatModule({ state, dispatch }: { state: any; dispatch: any }) {
  const [systemPrompt, setSystemPrompt] = useState(
    state.settings.defaultSystemPrompt
  );
  const [userPrompt, setUserPrompt] = useState("");
  const [messages, setMessages] = useState<any[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ready. Send a prompt to call Venice /chat/completions.",
    },
  ]);
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
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function send() {
    setPromptTouched(true);
    if (!userPrompt.trim() || loading) return;
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    setError("");
    setLoading(true);

    const userMessage = { id: crypto.randomUUID(), role: "user", content: userPrompt.trim() };
    const conversation = [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...messages.filter((m) => ["user", "assistant"].includes(m.role)),
      userMessage,
    ];
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: crypto.randomUUID(), role: "assistant", content: "" },
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
        await StorageService.saveItem("chats", {
          id: crypto.randomUUID(),
          prompt: userMessage.content,
          response: acc,
          model: state.selectedChatModel,
          timestamp: Date.now(),
        });
        const chats = await StorageService.getItems("chats");
        dispatch({ type: "SET_CHATS", items: chats });
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
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: "assistant", content };
          return next;
        });
        await StorageService.saveItem("chats", {
          id: crypto.randomUUID(),
          prompt: userMessage.content,
          response: content,
          model: state.selectedChatModel,
          timestamp: Date.now(),
        });
        const chats = await StorageService.getItems("chats");
        dispatch({ type: "SET_CHATS", items: chats });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Chat request failed");
      }
      setMessages((prev) => {
        const next = [...prev];
        if (
          next[next.length - 1]?.role === "assistant" &&
          !next[next.length - 1].content
        ) {
          next.pop(); // Remove empty assistant message
          if (next[next.length - 1]?.role === "user") {
            next.pop(); // Remove the user prompt that failed to get a response
          }
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
  }

  function clear() {
    setMessages([]);
    setError("");
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Conversation cleared.", type: "info" } });
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);

  return (
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Chat</h2>
            <div className="text-sm text-zinc-400 mt-1">
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
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
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
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all min-h-[80px]"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 p-1">
            <Field label="Web search">
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
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Venice parameters</label>
              <div className="flex flex-col gap-3 p-3 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={webScraping}
                    onChange={(e) => setWebScraping(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Web scraping</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={webCitations}
                    onChange={(e) => setWebCitations(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Citations</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Response mode</label>
              <div className="flex flex-col gap-3 p-3 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={includeVeniceSystemPrompt}
                    onChange={(e) => setIncludeVeniceSystemPrompt(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Include Venice system prompt</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stream}
                    onChange={(e) => setStream(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Stream response</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 p-1">
            <Field label="Reasoning effort">
              <select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">Reasoning / thinking</label>
              <div className="flex flex-col gap-3 p-3 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={stripThinking}
                    onChange={(e) => setStripThinking(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Strip &lt;think&gt; blocks</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={disableThinking}
                    onChange={(e) => setDisableThinking(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">Disable thinking</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Grok / xAI</label>
              <div className="flex flex-col gap-3 p-3 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={enableXSearch}
                    onChange={(e) => setEnableXSearch(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">xAI web + X search</span>
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
                  ? 'bg-brand-500 text-white rounded-tr-sm' 
                  : 'bg-[#1a1728] border border-white/5 text-zinc-100 rounded-tl-sm shadow-[0_4px_24px_rgba(0,0,0,0.2)]'
              }`}>
                <div className={`flex items-center gap-2 mb-2 text-xs font-semibold tracking-wider uppercase ${m.role === 'user' ? 'text-brand-200' : 'text-brand-400'}`}>
                  <span>{m.role}</span>
                  {m.role === "assistant" && idx === messages.length - 1 && loading && (
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-brand-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-brand-400 rounded-full animate-bounce"></span>
                    </span>
                  )}
                </div>
                <div className="prose prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
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
              className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all min-h-[100px] resize-y shadow-inner"
            />
            {promptTouched && !userPrompt.trim() && (
              <div id="chat-prompt-error" className="mt-2 text-sm text-red-400" role="alert">
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
    </section>
  );
}
