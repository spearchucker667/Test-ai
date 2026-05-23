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
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Chat</h2>
          <div className="small muted">
            POST /chat/completions, non-streaming by default.
          </div>
        </div>
        <DiagPreview diagnostics={state.diagnostics} />
      </div>

      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        <CollapsibleSection title="Model & Settings">
          <div className="grid two">
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
              />
            </Field>
          </div>

          <div style={{ marginTop: 8 }}>
            <ModelRefreshButton state={state} dispatch={dispatch} />
          </div>

          <div style={{ marginTop: 16 }}>
            <Field label="System prompt">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                style={{ minHeight: 64 }}
              />
            </Field>
          </div>

          <div className="grid three" style={{ marginTop: 16 }}>
            <Field label="Web search">
              <select
                value={webSearch}
                onChange={(e) => setWebSearch(e.target.value)}
              >
                <option value="off">off</option>
                <option value="on">on</option>
                <option value="auto">auto</option>
              </select>
            </Field>
            <div className="field">
              <label>Venice parameters</label>
              <div className="chip-row">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={webScraping}
                    onChange={(e) => setWebScraping(e.target.checked)}
                  />{" "}
                  Web scraping
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={webCitations}
                    onChange={(e) => setWebCitations(e.target.checked)}
                  />{" "}
                  Citations
                </label>
              </div>
            </div>
            <div className="field">
              <label>Response mode</label>
              <div className="chip-row">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={includeVeniceSystemPrompt}
                    onChange={(e) => setIncludeVeniceSystemPrompt(e.target.checked)}
                  />{" "}
                  Include Venice system prompt
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={stream}
                    onChange={(e) => setStream(e.target.checked)}
                  />{" "}
                  Stream response
                </label>
              </div>
            </div>
          </div>

          <div className="grid three" style={{ marginTop: 16 }}>
            <Field label="Reasoning effort">
              <select
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
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
            <div className="field">
              <label>Reasoning / thinking</label>
              <div className="chip-row">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={stripThinking}
                    onChange={(e) => setStripThinking(e.target.checked)}
                  />{" "}
                  Strip &lt;think&gt; blocks
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={disableThinking}
                    onChange={(e) => setDisableThinking(e.target.checked)}
                  />{" "}
                  Disable thinking
                </label>
              </div>
            </div>
            <div className="field">
              <label>Grok / xAI</label>
              <div className="chip-row">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={enableXSearch}
                    onChange={(e) => setEnableXSearch(e.target.checked)}
                  />{" "}
                  xAI web + X search
                </label>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        <div className="message-list" aria-live="polite">
          {messages.map((m, idx) => (
            <div key={m.id || `${m.role}-${m.content?.slice(0, 8)}`} className={`message ${m.role}`}>
              <div className="message-head">
                <strong>{m.role}</strong>
                {m.role === "assistant" &&
                  idx === messages.length - 1 &&
                  loading && <span>loading…</span>}
              </div>
              <Markdown
                text={
                  m.content ||
                  (loading && idx === messages.length - 1 ? "…" : "")
                }
              />
            </div>
          ))}
          <div ref={endRef}></div>
        </div>

        <StatusBlock error={error} />

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
          />
          {promptTouched && !userPrompt.trim() && (
            <div id="chat-prompt-error" className="validation-error" role="alert">
              Please enter a prompt before sending.
            </div>
          )}
        </Field>

        <div className="chip-row">
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
