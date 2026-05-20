import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
import { veniceFetch } from "../services/veniceClient";
import { extractImages, galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { upscaleGalleryImage, saveImageRecord as saveRecordService, refreshGallery } from "../services/imageWorkflowService";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { StatusBlock } from "../components/StatusBlock";
import { ImageActionModal } from "../components/ImageActionModal";
import { AppState, AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";
import { CollapsibleSection } from "../components/CollapsibleSection";

export function ImageModule({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  const draft = state.imageDraft;
  const [loading, setLoading] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState<GalleryImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const recentHistory = React.useMemo(() => {
    const map = new Map<string, GalleryImage>();
    // Sort array by timestamp descending so we get the newest
    // assuming it might not be sorted.
    const sorted = [...state.gallery].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    sorted.forEach((img) => {
      if (img.prompt) {
        const key = img.prompt.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, img);
        }
      }
    });
    return Array.from(map.values()).slice(0, 10);
  }, [state.gallery]);

  function patch(updates: any) {
    dispatch({ type: "SET_IMAGE_DRAFT", patch: updates });
  }

  function loadPromptAndSettings(img: GalleryImage) {
    if (img.model) {
      dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model: img.model });
    }
    patch({
      prompt: img.prompt,
      negative: img.negative || "",
      width: img.width ? Number(img.width) : draft.width,
      height: img.height ? Number(img.height) : draft.height,
      aspectRatio: img.aspectRatio || draft.aspectRatio,
      style: img.style || "",
      cfg: img.cfg || draft.cfg,
      steps: img.steps || draft.steps,
      safeMode: img.safeMode ?? draft.safeMode
    });
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Loaded prompt and settings", type: "info" } });
  }

  useEffect(() => {
    const presets: Record<string, [number, number]> = {
      "1:1": [1024, 1024],
      "16:9": [1216, 684],
      "9:16": [684, 1216],
      "4:3": [1152, 864],
      "3:4": [864, 1152],
    };
    if (presets[draft.aspectRatio]) {
      patch({
        width: presets[draft.aspectRatio][0],
        height: presets[draft.aspectRatio][1],
      });
    }
  }, [draft.aspectRatio]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function generate() {
    if (!draft.prompt.trim() || loading) return;
    setError("");
    setSuccess("");
    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const batchCount = Number(draft.imageCount) || 1;
    const batchId = crypto.randomUUID();
    let successCount = 0;
    const IMAGE_BATCH_INTER_REQUEST_DELAY_MS = 750;
    const delay = (ms: number, sig: AbortSignal) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(new DOMException("Request aborted", "AbortError"));
      const timeout = setTimeout(resolve, ms);
      sig.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new DOMException("Request aborted", "AbortError"));
      }, { once: true });
    });

    patch({ 
      generationProgress: batchCount > 1 ? `Queued ${batchCount} images` : "",
      currentImages: [] 
    });

    try {
      const newImages = [];
      for (let i = 0; i < batchCount; i++) {
        if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
        
        if (batchCount > 1 && i > 0) {
          patch({ generationProgress: `Waiting before next request to respect rate limits...` });
          await delay(IMAGE_BATCH_INTER_REQUEST_DELAY_MS, signal);
        }
        
        if (batchCount > 1) {
          patch({ generationProgress: `Generating image ${i + 1} of ${batchCount}...` });
        }

        const payload: any = {
          model: state.selectedImageModel,
          prompt: draft.prompt.trim(),
          width: Number(draft.width),
          height: Number(draft.height),
          aspect_ratio: draft.aspectRatio,
          steps: Number(draft.steps),
          cfg_scale: Number(draft.cfg),
          safe_mode: !!draft.safeMode,
          hide_watermark: !!draft.disableWatermark,
          return_binary: false,
        };
        if (draft.negative.trim()) payload.negative_prompt = draft.negative.trim();
        if (draft.style) payload.style_preset = draft.style;

        let resRaw;
        try {
          resRaw = await veniceFetch("/image/generate", {
            method: "POST",
            body: payload,
            signal,
            dispatch,
          });
        } catch (err: any) {
          // If watermark error
          if (err.status === 400 && String(err.message).toLowerCase().includes("watermark") && payload.hide_watermark) {
            dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Watermark parameter was rejected by this model/endpoint; retried without it.", type: "warn" }});
            delete payload.hide_watermark;
            resRaw = await veniceFetch("/image/generate", {
              method: "POST",
              body: payload,
              signal,
              dispatch,
            });
          } else {
            throw err;
          }
        }

        const images = extractImages(resRaw.data);
        if (!images.length)
          throw new Error("Image response did not contain detectable base64 image data or a URL.");

        const generatedImage = images[0];

        const saved = await saveRecordService(dispatch, {
          id: crypto.randomUUID(),
          image: generatedImage,
          prompt: draft.prompt,
          negative: draft.negative,
          model: state.selectedImageModel,
          width: draft.width,
          height: draft.height,
          aspectRatio: draft.aspectRatio,
          style: draft.style,
          cfg: draft.cfg,
          steps: draft.steps,
          safeMode: draft.safeMode,
          batchId,
          batchIndex: i + 1,
          batchCount,
          disableWatermark: !!draft.disableWatermark,
          timestamp: Date.now(),
        }, true);

        successCount++;
        newImages.push(saved);

        patch({ 
          currentImage: generatedImage, 
          lastSavedImageId: saved.id,
          currentImages: [...newImages] 
        });
      }

      setSuccess(batchCount > 1 ? `Generated and auto-saved ${successCount} images.` : `Image generated and auto-saved to gallery: ${newImages[0].id}`);
    } catch (err: any) {
      if (err.name !== "AbortError" && err.message !== "AbortError") {
        setError(err.message || "Image generation failed");
        if (successCount > 0) {
           setSuccess(`Generated and auto-saved ${successCount} of ${batchCount} images.`);
        }
      } else {
        if (successCount > 0) {
           setSuccess(`Generation cancelled. Saved ${successCount} images.`);
        } else {
           setSuccess("Generation cancelled.");
        }
      }
    } finally {
      if (successCount > 0) {
        await refreshGallery(dispatch);
      }
      setLoading(false);
      patch({ generationProgress: "" });
    }
  }

  async function saveCurrentAgain() {
    if (!draft.currentImage) return;
    const saved = await saveRecordService(dispatch, {
      id: crypto.randomUUID(),
      image: draft.currentImage,
      prompt: draft.prompt,
      negative: draft.negative,
      model: state.selectedImageModel,
      width: draft.width,
      height: draft.height,
      aspectRatio: draft.aspectRatio,
      style: draft.style,
      cfg: draft.cfg,
      steps: draft.steps,
      safeMode: draft.safeMode,
      timestamp: Date.now()
    });
    patch({ lastSavedImageId: saved.id });
    setSuccess(`Saved duplicate gallery copy: ${saved.id}`);
  }

  async function upscaleCurrent() {
    const item = expanded ||
      state.gallery.find((x: GalleryImage) => x.id === draft.lastSavedImageId) || {
        id: draft.lastSavedImageId || "current-preview",
        image: draft.currentImage,
        prompt: draft.prompt,
        negative: draft.negative,
        model: state.selectedImageModel,
        width: draft.width,
        height: draft.height,
        aspectRatio: draft.aspectRatio,
        style: draft.style,
        cfg: draft.cfg,
        steps: draft.steps,
        safeMode: draft.safeMode,
        timestamp: Date.now()
      };

    if (!item.image) return;
    setError("");
    setSuccess("");
    setUpscaling(true);
    try {
      const saved = await upscaleGalleryImage(item as GalleryImage, dispatch);
      patch({ currentImage: saved.image, lastSavedImageId: saved.id });
      setExpanded(saved);
      setSuccess(`Enhanced/upscaled image saved to gallery: ${saved.id}`);
    } catch (err: any) {
      setError(err.message || "Upscale failed");
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: err.message || "Upscale failed", type: "error" } });
    } finally {
      setUpscaling(false);
    }
  }

  async function deleteExpanded() {
    if (!expanded?.id) return;
    await StorageService.deleteItem("images", expanded.id);
    const items = await StorageService.getItems("images");
    dispatch({ type: "SET_GALLERY", items });
    
    // Update preview states if needed
    if (expanded.id === draft.lastSavedImageId) {
      patch({ currentImage: "", lastSavedImageId: null });
    }
    if (draft.currentImages?.length) {
      patch({
        currentImages: draft.currentImages.filter((img: any) => img.id !== expanded.id)
      });
    }

    setExpanded(null);
    setSuccess("Image deleted.");
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Image generation</h2>
          <div className="small muted">
            POST /image/generate. Images auto-save to IndexedDB gallery.
          </div>
        </div>
        <DiagPreview diagnostics={state.diagnostics} />
      </div>

      <div className="body grid two">
        <div className="grid">
          <Field label="Model">
            <ModelSelect
              value={state.selectedImageModel}
              models={state.models.image}
              onChange={(model) =>
                dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
              }
            />
          </Field>

          <Field label="Prompt">
            <textarea
              value={draft.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              placeholder="Premium cinematic product render…"
              rows={4}
            />
          </Field>

          <CollapsibleSection title="Advanced Settings & Batch">
            <div className="grid">
              <Field label="Negative prompt">
                <input
                  value={draft.negative}
                  onChange={(e) => patch({ negative: e.target.value })}
                  placeholder="low quality, blurry, distorted"
                />
              </Field>

              <div className="grid three">
                <Field label="Aspect ratio">
                  <select
                    value={draft.aspectRatio}
                    onChange={(e) => patch({ aspectRatio: e.target.value })}
                  >
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="custom">custom</option>
                  </select>
                </Field>
                <Field label="Width">
                  <input
                    type="number"
                    min="256"
                    step="64"
                    value={draft.width}
                    onChange={(e) => patch({ width: e.target.value })}
                  />
                </Field>
                <Field label="Height">
                  <input
                    type="number"
                    min="256"
                    step="64"
                    value={draft.height}
                    onChange={(e) => patch({ height: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid three">
                <Field label="Steps">
                  <input
                    type="number"
                    min="1"
                    max="80"
                    value={draft.steps}
                    onChange={(e) => patch({ steps: e.target.value })}
                  />
                </Field>
                <Field label="CFG scale">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={draft.cfg}
                    onChange={(e) => patch({ cfg: e.target.value })}
                  />
                </Field>
                <Field label="Style preset">
                  <select
                    value={draft.style}
                    onChange={(e) => patch({ style: e.target.value })}
                  >
                    <option value="">none</option>
                    <option value="3D Model">3D Model</option>
                    <option value="Analog Film">Analog Film</option>
                    <option value="Anime">Anime</option>
                    <option value="Cinematic">Cinematic</option>
                    <option value="Comic Book">Comic Book</option>
                    <option value="Digital Art">Digital Art</option>
                    <option value="Fantasy Art">Fantasy Art</option>
                    <option value="Photographic">Photographic</option>
                    <option value="Pixel Art">Pixel Art</option>
                  </select>
                </Field>
              </div>

              <div className="grid two">
                <Field label="Image count">
                  <select
                    value={draft.imageCount || 1}
                    onChange={(e) => patch({ imageCount: Number(e.target.value) })}
                    disabled={loading}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10</option>
                  </select>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    Creates up to 10 separate images from the same prompt. Large batches are queued to respect rate limits.
                  </div>
                </Field>
                <Field label="Safeguard / Watermark">
                  <div className="grid two" style={{ marginTop: 8 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={draft.safeMode}
                        onChange={(e) => patch({ safeMode: e.target.checked })}
                      />
                      safe_mode
                    </label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={draft.disableWatermark}
                        onChange={(e) => patch({ disableWatermark: e.target.checked })}
                      />
                      disable watermark
                    </label>
                  </div>
                  <div className="tiny muted" style={{ marginTop: 4 }}>
                    Watermark disabling is sent only when supported by the selected Venice image endpoint/model.
                  </div>
                </Field>
              </div>
            </div>
          </CollapsibleSection>

          <StatusBlock error={error} success={success} />

          <div className="chip-row">
            <button
              className="btn primary"
              onClick={generate}
              disabled={loading || !draft.prompt.trim()}
            >
              {loading ? "Generating…" : "Generate + auto-save"}
            </button>
            <button
              className="btn"
              onClick={() => abortRef.current?.abort()}
              disabled={!loading}
            >
              Cancel
            </button>
            <button
              className="btn"
              onClick={async () => {
                await downloadImage(draft.currentImage, "venice-image.png");
                dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
              }}
              disabled={!draft.currentImage}
            >
              Download image
            </button>
            <button
              className="btn"
              onClick={saveCurrentAgain}
              disabled={!draft.currentImage}
            >
              Save another copy
            </button>
            <button
              className="btn"
              onClick={upscaleCurrent}
              disabled={!draft.currentImage || upscaling}
            >
              {upscaling ? "Enhancing…" : "Enhance & upscale"}
            </button>
          </div>
        </div>

        <div className="grid">
          <div className="image-preview">
            {draft.generationProgress ? (
              <div style={{ display: 'grid', placeItems: 'center', gap: '8px' }}>
                <div className="muted">{draft.generationProgress}</div>
                <div className="progress-bar"><div className="progress-bar-fill" /></div>
              </div>
            ) : draft.currentImages && draft.currentImages.length > 1 ? (
              <div className={`batch-preview-grid items-${draft.currentImages.length}`}>
                {draft.currentImages.map((savedDoc: any, idx: number) => (
                  <img
                    key={savedDoc.id || idx}
                    src={savedDoc.image}
                    alt={`Generated by Venice ${idx + 1}`}
                    onClick={() => setExpanded(savedDoc)}
                    className="batch-img-thumb"
                  />
                ))}
              </div>
            ) : draft.currentImage ? (
              <img
                src={draft.currentImage}
                alt="Generated by Venice"
                onClick={() =>
                  setExpanded(
                    state.gallery.find(
                      (x: any) => x.id === draft.lastSavedImageId
                    ) || {
                      id: draft.lastSavedImageId || "preview",
                      image: draft.currentImage,
                      prompt: draft.prompt,
                      model: state.selectedImageModel,
                      timestamp: Date.now(),
                    }
                  )
                }
              />
            ) : (
              <div className="muted">Generated image preview</div>
            )}
          </div>
          <div className="small muted">
            Prompt and controls persist when switching menus. Generated images
            auto-save to Gallery.
          </div>
        </div>
      </div>

      {recentHistory.length > 0 && (
        <div style={{ padding: "0 20px 20px" }}>
          <CollapsibleSection title="Recent Prompts & Settings" defaultOpen={false}>
            <div className="grid two" style={{ gap: 16 }}>
              {recentHistory.map((img) => (
                <div key={img.id} className="history-card" style={{ display: "flex", gap: 12, padding: 16, backgroundColor: "var(--panel-strong)", borderRadius: 24, alignItems: "center" }}>
                  <img src={img.image} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }}>
                      {img.prompt}
                    </div>
                    <div className="tiny muted mt-1">
                      {img.model} • {img.aspectRatio || `${img.width}x${img.height}`}
                    </div>
                    <div className="chip-row mt-2" style={{ gap: 6 }}>
                      <button className="btn small" onClick={() => loadPromptAndSettings(img)}>Load Settings</button>
                      <button className="btn small" onClick={() => {
                        patch({ prompt: img.prompt });
                        dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Copied prompt", type: "info" } });
                      }}>Copy Prompt</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      )}

      <ImageActionModal
        image={expanded}
        isUpscaling={expanded ? upscaling : false}
        onClose={() => setExpanded(null)}
        onDownload={async () => {
          if (!expanded) return;
          await downloadImage(expanded.image, galleryFilename(expanded.prompt, expanded.timestamp));
          dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
        }}
        onUpscale={upscaleCurrent}
        onDelete={deleteExpanded}
      />
    </section>
  );
}
