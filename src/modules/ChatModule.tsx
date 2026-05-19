import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
import { veniceFetch, veniceStreamChat } from "../services/veniceClient";
import { DEFAULT_SYSTEM_PROMPT } from "../constants/venice";
import { Markdown } from "../utils/markdown";
import { copyText } from "../utils/download";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { StatusBlock } from "../components/StatusBlock";

export function ChatModule({ state, dispatch }: { state: any; dispatch: any }) {
  const [systemPrompt, setSystemPrompt] = useState(
    state.settings.defaultSystemPrompt
  );
  const [userPrompt, setUserPrompt] = useState("");
  const [messages, setMessages] = useState<any[]>([
    {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    if (!userPrompt.trim() || loading) return;
    setError("");
    setLoading(true);

    const userMessage = { role: "user", content: userPrompt.trim() };
    const conversation = [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...messages.filter((m) => ["user", "assistant"].includes(m.role)),
      userMessage,
    ];
    setMessages((prev) => [
      ...prev,
      userMessage,
      { role: "assistant", content: "" },
    ]);
    setUserPrompt("");

    const payload: any = {
      model: state.selectedChatModel,
      messages: conversation,
      stream,
      venice_parameters: {
        include_venice_system_prompt: includeVeniceSystemPrompt,
        enable_web_search: webSearch,
        enable_web_scraping: !!webScraping,
        enable_web_citations: !!webCitations,
      },
    };
    if (characterSlug.trim())
      payload.venice_parameters.character_slug = characterSlug.trim();

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
              next[next.length - 1] = { role: "assistant", content: acc };
              return next;
            });
          },
        });
      } else {
        const { data } = await veniceFetch("/chat/completions", {
          method: "POST",
          body: payload,
          signal: abortRef.current.signal,
          dispatch,
        });
        const content =
          data?.choices?.[0]?.message?.content ||
          data?.choices?.[0]?.text ||
          JSON.stringify(data);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content };
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
        setMessages((prev) => {
          const next = [...prev];
          if (
            next[next.length - 1]?.role === "assistant" &&
            !next[next.length - 1].content
          )
            next.pop();
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setLoading(false);
  }

  function clear() {
    setMessages([{ role: "assistant", content: "Conversation cleared." }]);
    setError("");
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

      <div className="body grid">
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

        <Field label="System prompt">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </Field>

        <div className="grid three">
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

        <div className="message-list" aria-live="polite">
          {messages.map((m, idx) => (
            <div key={idx} className={`message ${m.role}`}>
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
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Ask Venice something…"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
          />
        </Field>

        <div className="chip-row">
          <button
            className="btn primary"
            onClick={send}
            disabled={loading || !userPrompt.trim()}
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
