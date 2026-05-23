// Code Owner: fayeblade (@spearchucker667)
// Image generation module — orchestrates params, preview, and history.
import React, { useState, useRef, useEffect } from "react";
import StorageService from "../services/storageService";
import { veniceFetch } from "../services/veniceClient";
import { extractImages, galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { upscaleGalleryImage, saveImageRecord as saveRecordService, refreshGallery } from "../services/imageWorkflowService";
import { IMAGE_BATCH_INTER_REQUEST_DELAY_MS } from "../constants/venice";
import { buildImagePayload, normalizeImageDraft } from "../utils/payloadBuilders";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { StatusBlock } from "../components/StatusBlock";
import { ImageActionModal } from "../components/ImageActionModal";
import { ImageGenerationForm } from "../components/ImageGenerationForm";
import { ImageGenerationPreview } from "../components/ImageGenerationPreview";
import { AppState, AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";

export function ImageModule({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  const draft = state.imageDraft;
  const [loading, setLoading] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [expanded, setExpanded] = useState<GalleryImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const recentHistory = React.useMemo(() => {
    const map = new Map<string, GalleryImage>();
    const sorted = [...state.gallery].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    sorted.forEach((img) => {
      if (img.prompt) {
        const key = img.prompt.trim().toLowerCase();
        if (!map.has(key)) map.set(key, img);
      }
    });
    return Array.from(map.values()).slice(0, 10);
  }, [state.gallery]);

  function patch(updates: any) {
    dispatch({ type: "SET_IMAGE_DRAFT", patch: updates });
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
    return () => { abortRef.current?.abort(); };
  }, []);

  async function generate() {
    setPromptTouched(true);
    if (!draft.prompt.trim() || loading) return;
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const normalizedDraft = normalizeImageDraft(draft);
    const batchCount = normalizedDraft.imageCount as number;
    const batchId = crypto.randomUUID();
    let successCount = 0;
    const delay = (ms: number, sig: AbortSignal) => new Promise<void>((resolve, reject) => {
      if (sig.aborted) return reject(new DOMException("Request aborted", "AbortError"));
      const timeout = setTimeout(resolve, ms);
      sig.addEventListener("abort", () => { clearTimeout(timeout); reject(new DOMException("Request aborted", "AbortError")); }, { once: true });
    });

    patch({ generationProgress: batchCount > 1 ? `Queued ${batchCount} images` : "", currentImages: [] });

    try {
      const newImages = [];
      for (let i = 0; i < batchCount; i++) {
        if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
        if (batchCount > 1 && i > 0) {
          patch({ generationProgress: "Waiting before next request to respect rate limits..." });
          await delay(IMAGE_BATCH_INTER_REQUEST_DELAY_MS, signal);
        }
        if (batchCount > 1) {
          patch({ generationProgress: `Generating image ${i + 1} of ${batchCount}...` });
        }

        const payload = buildImagePayload(state.selectedImageModel, normalizedDraft);
        let resRaw;
        try {
          resRaw = await veniceFetch("/image/generate", { method: "POST", body: payload, signal, dispatch });
        } catch (err: any) {
          if (err.status === 400 && String(err.message).toLowerCase().includes("watermark") && payload.hide_watermark) {
            dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Watermark parameter was rejected by this model/endpoint; retried without it.", type: "warn" }});
            delete payload.hide_watermark;
            resRaw = await veniceFetch("/image/generate", { method: "POST", body: payload, signal, dispatch });
          } else {
            throw err;
          }
        }

        const images = extractImages(resRaw.data);
        if (!images.length) throw new Error("Image response did not contain detectable base64 image data or a URL.");
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
        patch({ currentImage: generatedImage, lastSavedImageId: saved.id, currentImages: [...newImages] });
      }

      setSuccess(batchCount > 1 ? `Generated and auto-saved ${successCount} images.` : `Image generated and auto-saved to gallery: ${newImages[0].id}`);
    } catch (err: any) {
      if (err.name !== "AbortError" && err.message !== "AbortError") {
        setError(err.message || "Image generation failed");
        if (successCount > 0) setSuccess(`Generated and auto-saved ${successCount} of ${batchCount} images.`);
      } else {
        if (successCount > 0) setSuccess(`Generation cancelled. Saved ${successCount} images.`);
        else setSuccess("Generation cancelled.");
      }
    } finally {
      if (successCount > 0) await refreshGallery(dispatch);
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
      timestamp: Date.now(),
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
        timestamp: Date.now(),
      };
    if (!item.image) return;
    setError("");
    setSuccess("");
    setUpscaling(true);
    try {
      const saved = await upscaleGalleryImage(item as GalleryImage, dispatch, {});
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
    if (expanded.id === draft.lastSavedImageId) {
      patch({ currentImage: "", lastSavedImageId: null });
    }
    if (draft.currentImages?.length) {
      patch({ currentImages: draft.currentImages.filter((img: any) => img.id !== expanded.id) });
    }
    setExpanded(null);
    setSuccess("Image deleted.");
  }

  function loadPromptAndSettings(img: GalleryImage) {
    if (img.model) dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model: img.model });
    patch({
      prompt: img.prompt,
      negative: img.negative || "",
      width: img.width ? Number(img.width) : draft.width,
      height: img.height ? Number(img.height) : draft.height,
      aspectRatio: img.aspectRatio || draft.aspectRatio,
      style: img.style || "",
      cfg: img.cfg || draft.cfg,
      steps: img.steps || draft.steps,
      safeMode: img.safeMode ?? draft.safeMode,
    });
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Loaded prompt and settings", type: "info" } });
  }

  return (
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Image generation</h2>
          <div className="small muted">POST /image/generate. Images auto-save to IndexedDB gallery.</div>
        </div>
        <DiagPreview diagnostics={state.diagnostics} />
      </div>

      <div className="body grid two">
        <ImageGenerationForm
          state={state}
          dispatch={dispatch}
          draft={draft}
          loading={loading}
          error={error}
          success={success}
          promptTouched={promptTouched}
          setPromptTouched={setPromptTouched}
          onGenerate={generate}
          onCancel={() => abortRef.current?.abort()}
          onDownload={async () => {
            await downloadImage(draft.currentImage, "venice-image.png");
            dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
          }}
          onSaveAgain={saveCurrentAgain}
          onUpscale={upscaleCurrent}
        />
        <ImageGenerationPreview
          state={state}
          dispatch={dispatch}
          draft={draft}
          recentHistory={recentHistory}
          onExpand={setExpanded}
          onLoadSettings={loadPromptAndSettings}
        />
      </div>

      <ImageActionModal
        image={expanded}
        isUpscaling={expanded ? upscaling : false}
        onClose={() => setExpanded(null)}
        onDownload={async () => {
          if (!expanded) return;
          await downloadImage(expanded.image, galleryFilename(expanded));
          dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
        }}
        onUpscale={upscaleCurrent}
        onDelete={deleteExpanded}
      />
    </section>
  );
}
