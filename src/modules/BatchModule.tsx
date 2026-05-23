import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
import { veniceFetch } from "../services/veniceClient";
import { extractImages } from "../utils/image";
import { isValidChatResponse } from "../utils/veniceValidation";
import { normalizeImageDraft } from "../utils/payloadBuilders";
import { downloadImage } from "../utils/download";
import { desktopFiles } from "../services/desktopBridge";
import { IMAGE_BATCH_INTER_REQUEST_DELAY_MS } from "../constants/venice";
import { buildChatPayload, buildImagePayload } from "../utils/payloadBuilders";
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
  const [promptsTouched, setPromptsTouched] = useState(false);
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
    setPromptsTouched(true);
    const lines = draft.promptsText
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    if (state.usingFallbackModels) {
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: "Fallback models are active. Please refresh the model catalog before running batch.",
          type: "error",
          duration: 6000,
        },
      });
      return;
    }

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
          const payload = buildChatPayload(
            state.selectedChatModel,
            [
              { role: "system", content: state.settings.defaultSystemPrompt },
              { role: "user", content: newResults[i].prompt },
            ],
            {
              includeVeniceSystemPrompt: state.settings.includeVeniceSystemPrompt,
              webSearch: state.settings.webSearch,
              webScraping: state.settings.webScraping,
              webCitations: state.settings.webCitations,
            }
          );
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
          const payload = buildImagePayload(
            state.selectedImageModel,
            state.imageDraft,
            newResults[i].prompt
          );

          const { data } = await veniceFetch("/image/generate", {
            method: "POST",
            body: payload,
            signal: abortRef.current.signal,
            dispatch,
          });
          const images = extractImages(data);
          if (!images.length) throw new Error("No image data returned.");

          const normalizedDraft = normalizeImageDraft(state.imageDraft);
          await StorageService.saveItem("images", {
            id: crypto.randomUUID(),
            image: images[0],
            prompt: newResults[i].prompt,
            negative: normalizedDraft.negative,
            model: state.selectedImageModel,
            width: normalizedDraft.width,
            height: normalizedDraft.height,
            aspectRatio: normalizedDraft.aspectRatio,
            style: normalizedDraft.style,
            cfg: normalizedDraft.cfg,
            steps: normalizedDraft.steps,
            safeMode: normalizedDraft.safeMode,
            disableWatermark: normalizedDraft.disableWatermark,
            timestamp: Date.now(),
          });

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
        await sleep(IMAGE_BATCH_INTER_REQUEST_DELAY_MS, abortRef.current.signal).catch(() => {});
      }
    }

    setIsRunning(false);
    if (draft.type === "text") {
      const chats = await StorageService.getItems("chats");
      dispatch({ type: "SET_CHATS", items: chats });
    } else {
      const gallery = await StorageService.getItems("images");
      dispatch({ type: "SET_GALLERY", items: gallery });
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setResults((prev) =>
      prev.map((r) =>
        r.status === "running" || r.status === "pending"
          ? { ...r, status: "cancelled" }
          : r
      )
    );
    setIsRunning(false);
  }

  async function exportJson() {
    if (!results.length) return;
    const filename = `venice-batch-${draft.type}-${Date.now()}.json`;
    await desktopFiles.exportJson(results, filename);
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
              onChange={(e) => {
                patch({ promptsText: e.target.value });
                if (promptsTouched && e.target.value.trim()) setPromptsTouched(false);
              }}
              onBlur={() => { if (!draft.promptsText.trim()) setPromptsTouched(true); }}
              placeholder="Enter multiple prompts here, one per line..."
              style={{ minHeight: "180px" }}
              aria-invalid={promptsTouched && !draft.promptsText.trim()}
              aria-describedby="batch-prompts-error"
            />
            {promptsTouched && !draft.promptsText.trim() && (
              <div id="batch-prompts-error" className="validation-error" role="alert">
                Please enter at least one prompt before running the batch.
              </div>
            )}
          </Field>

          <div className="chip-row">
            <button
              className="btn primary"
              onClick={runBatch}
              disabled={isRunning}
              aria-disabled={isRunning || !draft.promptsText.trim()}
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
                      onClick={async () =>
                        await downloadImage(r.result, `venice-batch-${i}.png`)
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
