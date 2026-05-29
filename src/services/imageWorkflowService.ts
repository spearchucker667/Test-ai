/** @fileoverview Gallery lifecycle helpers for saving, upscaling, and bulk-downloading images. */

import StorageService from "./storageService";
import { AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";
import { veniceFetch } from "./veniceClient";
import { buildImagePayload, ImageDraftLike } from "../utils/payloadBuilders";
import { extractImages, galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { isValidImageResponse } from "../utils/veniceValidation";
import { error } from "../shared/logger";

/**
 * Refreshes the gallery state by reloading all image records from IndexedDB.
 * @param dispatch The app dispatch function.
 */
export const refreshGallery = async (dispatch: AppDispatch) => {
  const items = await StorageService.getItems("images");
  dispatch({ type: "SET_GALLERY", items });
};

interface GenerateImageOptions {
  signal?: AbortSignal;
  dispatch?: AppDispatch;
  onWatermarkRetry?: () => void;
}

/**
 * Calls /image/generate and retries once without hide_watermark when rejected.
 */
export const generateImageWithWatermarkFallback = async (
  model: string,
  draft: ImageDraftLike,
  options: GenerateImageOptions = {},
  promptOverride?: string
) => {
  const { signal, dispatch, onWatermarkRetry } = options;
  const payload = buildImagePayload(model, draft, promptOverride);
  try {
    return await veniceFetch("/image/generate", { method: "POST", body: payload, signal, dispatch });
  } catch (err) {
    const watermarkRejected =
      err && typeof err === "object" && "status" in err && (err as { status: number }).status === 400 &&
      String((err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "") || "").toLowerCase().includes("watermark") &&
      !!payload.hide_watermark;
    if (!watermarkRejected) throw err;

    const retryPayload = { ...payload };
    delete retryPayload.hide_watermark;
    onWatermarkRetry?.();
    return await veniceFetch("/image/generate", { method: "POST", body: retryPayload, signal, dispatch });
  }
};

/**
 * Persists an image record to IndexedDB and optionally refreshes the gallery.
 * @param dispatch The app dispatch function.
 * @param record The image record to save.
 * @param skipRefresh If true, skips the automatic gallery refresh after saving.
 * @returns A promise resolving to the saved record.
 */
export const saveImageRecord = async (dispatch: AppDispatch, record: GalleryImage, skipRefresh?: boolean) => {
  const saved = await StorageService.saveItem("images", {
    ...record,
    id: record.id || crypto.randomUUID(),
    timestamp: record.timestamp || Date.now(),
  });
  if (!skipRefresh) {
    await refreshGallery(dispatch);
  }
  return saved;
};

/** Options for upscaling a gallery image. */
interface UpscaleOptions {
  model?: string;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Upscales a gallery image via the Venice API and saves the result.
 * @param item The source gallery image to upscale.
 * @param dispatch The app dispatch function.
 * @param options Optional callbacks and model override.
 * @returns A promise resolving to the newly saved upscaled record.
 */
export const upscaleGalleryImage = async (
  item: GalleryImage,
  dispatch: AppDispatch,
  options: UpscaleOptions = {}
) => {
  const { model = "upscale-model", onComplete, onError } = options;
  try {
    const { data } = await veniceFetch("/image/upscale", {
      method: "POST",
      body: {
        image: item.image,
      },
      dispatch,
    });

    if (!isValidImageResponse(data)) {
      throw new Error("Upscaler returned an unexpected response shape.");
    }
    const images = extractImages(data);
    if (!images.length) throw new Error("No image data returned from upscaler.");

    const saved = await saveImageRecord(dispatch, {
      id: crypto.randomUUID(),
      image: images[0],
      prompt: item.prompt,
      negative: item.negative,
      model,
      timestamp: Date.now(),
      upscaled: true,
      parentId: item.id,
      batchId: item.batchId || null,
      batchIndex: item.batchIndex || null,
      batchCount: item.batchCount || null,
      disableWatermark: item.disableWatermark ?? true,
    });
    
    if (onComplete) onComplete();
    return saved;
  } catch (err) {
    error("Upscale failed", err);
    if (onError) onError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
};

/** Options for bulk gallery downloads. */
export interface DownloadAllOptions {
  onProgress?: (current: number, total: number) => void;
  cancelSignal?: { current: boolean };
}

/**
 * Downloads up to 50 gallery images with a throttled delay between items.
 * @param items The gallery images to download.
 * @param addToast A callback for surfacing toast notifications.
 * @param options Optional progress and cancellation controls.
 */
export const downloadAllGallery = async (
  items: GalleryImage[],
  addToast: (msg: string, type: "info" | "success" | "error") => void,
  options: DownloadAllOptions = {}
) => {
  const { onProgress, cancelSignal } = options;

  if (!items.length) {
    addToast("No images to download.", "info");
    return;
  }

  const max = Math.min(items.length, 50);
  if (items.length > 50) {
    addToast("Downloading first 50 images. Large downloads may take time.", "info");
  }

  let downloaded = 0;
  let failed = 0;
  for (let i = 0; i < max; i++) {
    if (cancelSignal?.current) {
      addToast(`Download cancelled. Saved ${downloaded} of ${max} images.`, "info");
      return;
    }
    const item = items[i];
    try {
      const result = await downloadImage(item.image, galleryFilename(item));
      if (result.confirmed) {
        downloaded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    onProgress?.(downloaded + failed, max);
    if (i < max - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  addToast(`Saved ${downloaded} images${failed ? ` (${failed} failed)` : ''}.`, "success");
};
