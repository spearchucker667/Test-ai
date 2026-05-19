import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
import { veniceFetch } from "../services/veniceClient";
import { extractImages } from "../utils/image";
import { downloadDataUrl } from "../utils/download";
import { Field } from "../components/Field";
import { Chip } from "../components/Chip";
import { Markdown } from "../utils/markdown";
import { DiagPreview } from "../components/DiagnosticsPreview";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        reject(new DOMException("Request aborted", "AbortError"));
      }, { once: true });
    }
  });
}

export function BatchModule({ state, dispatch }: { state: any; dispatch: any }) {
  const draft = state.batchDraft || { type: "text", promptsText: "" };
  const [results, setResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function patch(updates: any) {
    dispatch({ type: "SET_BATCH_DRAFT", patch: updates });
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function runBatch() {
    const lines = draft.promptsText
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const newResults = lines.map((p: string) => ({
      id: crypto.randomUUID(),
      prompt: p,
      status: "pending",
      result: null,
      error: null,
    }));

    setResults(newResults);
    setIsRunning(true);
    abortRef.current = new AbortController();

    for (let i = 0; i < newResults.length; i++) {
      if (abortRef.current?.signal.aborted) break;

      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "running" } : r))
      );

      try {
        if (draft.type === "text") {
          const payload = {
            model: state.selectedChatModel,
            messages: [
              { role: "system", content: state.settings.defaultSystemPrompt },
              { role: "user", content: newResults[i].prompt },
            ],
            venice_parameters: {
              include_venice_system_prompt:
                state.settings.includeVeniceSystemPrompt,
              enable_web_search: state.settings.webSearch,
              enable_web_scraping: state.settings.webScraping,
              enable_web_citations: state.settings.webCitations,
            },
          };
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

          await StorageService.saveItem("chats", {
            id: crypto.randomUUID(),
            prompt: newResults[i].prompt,
            response: content,
            model: state.selectedChatModel,
            timestamp: Date.now(),
          });

          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "done", result: content } : r
            )
          );
        } else {
          const idraft = state.imageDraft;
          const payload: any = {
            model: state.selectedImageModel,
            prompt: newResults[i].prompt,
            width: Number(idraft.width),
            height: Number(idraft.height),
            aspect_ratio: idraft.aspectRatio,
            steps: Number(idraft.steps),
            cfg_scale: Number(idraft.cfg),
            safe_mode: !!idraft.safeMode,
            return_binary: false,
          };
          if (idraft.negative.trim())
            payload.negative_prompt = idraft.negative.trim();
          if (idraft.style) payload.style_preset = idraft.style;

          const { data } = await veniceFetch("/image/generate", {
            method: "POST",
            body: payload,
            signal: abortRef.current.signal,
            dispatch,
          });
          const images = extractImages(data);
          if (!images.length) throw new Error("No image data returned.");

          await StorageService.saveItem("images", {
            id: crypto.randomUUID(),
            image: images[0],
            prompt: newResults[i].prompt,
            negative: idraft.negative,
            model: state.selectedImageModel,
            width: idraft.width,
            height: idraft.height,
            aspectRatio: idraft.aspectRatio,
            style: idraft.style,
            cfg: idraft.cfg,
            steps: idraft.steps,
            safeMode: idraft.safeMode,
            timestamp: Date.now(),
          });
          const gallery = await StorageService.getItems("images");
          dispatch({ type: "SET_GALLERY", items: gallery });

          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "done", result: images[0] } : r
            )
          );
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setResults((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, status: "error", error: err.message } : r
            )
          );
        }
      }

      if (i < newResults.length - 1 && !abortRef.current?.signal.aborted) {
        await sleep(1500, abortRef.current.signal).catch(() => {});
      }
    }

    setIsRunning(false);
    const chats = await StorageService.getItems("chats");
    dispatch({ type: "SET_CHATS", items: chats });
  }

  function cancel() {
    abortRef.current?.abort();
    setIsRunning(false);
  }

  function exportJson() {
    if (!results.length) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `venice-batch-${draft.type}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Batch Processing</h2>
          <div className="small muted">
            Run multiple text or image prompts sequentially. Auto-saves to
            history/gallery.
          </div>
        </div>
        <DiagPreview diagnostics={state.diagnostics} />
      </div>

      <div className="body grid two">
        <div className="grid">
          <Field label="Processing Type">
            <select
              value={draft.type}
              onChange={(e) => patch({ type: e.target.value })}
            >
              <option value="text">Text (Chat Model)</option>
              <option value="image">Image (Image Model)</option>
            </select>
          </Field>

          <div className="notice small">
            <b>Settings Inherited:</b> Using your current settings from the{" "}
            {draft.type === "text" ? "Chat/Settings" : "Image"} tabs.<br />
            Current Model:{" "}
            <span className="mono">
              {draft.type === "text"
                ? state.selectedChatModel
                : state.selectedImageModel}
            </span>
          </div>

          <Field label="Prompts (One per line)">
            <textarea
              value={draft.promptsText}
              onChange={(e) => patch({ promptsText: e.target.value })}
              placeholder="Enter multiple prompts here, one per line..."
              style={{ minHeight: "180px" }}
            />
          </Field>

          <div className="chip-row">
            <button
              className="btn primary"
              onClick={runBatch}
              disabled={isRunning || !draft.promptsText.trim()}
            >
              {isRunning ? "Running Batch..." : "Run Batch"}
            </button>
            <button className="btn" onClick={cancel} disabled={!isRunning}>
              Cancel
            </button>
            <button
              className="btn ghost"
              onClick={exportJson}
              disabled={!results.length}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div className="grid">
          <div className="panel pad">
            <div className="panel-header" style={{ marginBottom: 0 }}>
              <div className="panel-title">Batch Results</div>
              <Chip>{results.length} tasks</Chip>
            </div>
          </div>

          {results.length === 0 && (
            <div className="muted small">
              Results will appear here once the batch starts.
            </div>
          )}

          <div className="grid">
            {results.map((r, i) => (
              <div key={r.id} className="batch-result-row">
                <div
                  className="chip-row"
                  style={{ justifyContent: "space-between" }}
                >
                  <div className="tiny muted">Task {i + 1}</div>
                  <Chip
                    tone={
                      r.status === "done"
                        ? "ok"
                        : r.status === "error"
                        ? "danger"
                        : r.status === "running"
                        ? "running"
                        : ""
                    }
                  >
                    {r.status}
                  </Chip>
                </div>
                <div className="small font-bold">{r.prompt}</div>

                {r.status === "error" && (
                  <div className="error tiny">{r.error}</div>
                )}

                {r.status === "done" && draft.type === "text" && (
                  <div className="prompt-box">
                    <Markdown text={r.result} />
                  </div>
                )}

                {r.status === "done" && draft.type === "image" && (
                  <div>
                    <img
                      src={r.result}
                      alt={r.prompt}
                      className="batch-img-thumb"
                      onClick={() =>
                        downloadDataUrl(r.result, `venice-batch-${i}.png`)
                      }
                    />
                    <div className="tiny muted mt-1">Tap to download</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
