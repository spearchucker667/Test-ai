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
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Batch Processing</h2>
            <div className="text-sm text-zinc-400 mt-1">
              Run multiple text or image prompts sequentially. Auto-saves to
              history/gallery.
            </div>
          </div>
          <DiagPreview diagnostics={state.diagnostics} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-6">
            <Field label="Processing Type">
              <select
                value={draft.type}
                onChange={(e) => patch({ type: e.target.value })}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
              >
                <option value="text">Text (Chat Model)</option>
                <option value="image">Image (Image Model)</option>
              </select>
            </Field>

            <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-brand-200/80">
              <strong className="text-brand-300">Settings Inherited:</strong> Using your current settings from the{" "}
              {draft.type === "text" ? "Chat/Settings" : "Image"} tabs.<br />
              <div className="mt-2 text-zinc-400">Current Model:{" "}
                <span className="font-mono text-white ml-1">
                  {draft.type === "text"
                    ? state.selectedChatModel
                    : state.selectedImageModel}
                </span>
              </div>
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
                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono text-sm resize-y shadow-inner"
                style={{ minHeight: "180px" }}
                aria-invalid={promptsTouched && !draft.promptsText.trim()}
                aria-describedby="batch-prompts-error"
              />
              {promptsTouched && !draft.promptsText.trim() && (
                <div id="batch-prompts-error" className="mt-2 text-sm text-red-400" role="alert">
                  Please enter at least one prompt before running the batch.
                </div>
              )}
            </Field>

            <div className="flex flex-wrap gap-3">
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
                className="btn"
                onClick={exportJson}
                disabled={!results.length}
              >
                Export JSON
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-medium text-white">Batch Results</h3>
              <Chip>{results.length} tasks</Chip>
            </div>

            {results.length === 0 && (
              <div className="text-sm text-zinc-500 p-8 rounded-xl bg-black/20 border border-white/5 text-center">
                Results will appear here once the batch starts.
              </div>
            )}

            <div className="flex flex-col gap-4">
              {results.map((r, i) => (
                <div key={r.id} className="rounded-xl bg-black/40 border border-white/5 p-4 transition-all flex flex-col gap-3 relative overflow-hidden group">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Task {i + 1}</div>
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
                  <div className="text-sm font-medium text-white break-words">{r.prompt}</div>

                  {r.status === "error" && (
                    <div className="rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 mt-1">{r.error}</div>
                  )}

                  {r.status === "done" && draft.type === "text" && (
                    <div className="mt-2 pt-3 border-t border-white/5 prose prose-invert max-w-none text-sm leading-relaxed prose-p:my-2 prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl">
                      <Markdown text={r.result} />
                    </div>
                  )}

                  {r.status === "done" && draft.type === "image" && (
                    <div className="mt-2 group/img relative inline-block cursor-pointer" onClick={async () =>
                        await downloadImage(r.result, `venice-batch-${i}.png`)
                      }>
                      <img
                        src={r.result}
                        alt={r.prompt}
                        className="rounded-lg object-cover max-w-[200px] border border-white/10 transition-transform duration-300 group-hover/img:scale-[1.02] shadow-lg"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 rounded-lg flex items-center justify-center text-xs font-medium text-white backdrop-blur-sm pointer-events-none">
                        Tap to download
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
