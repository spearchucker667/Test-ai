import StorageService from "./storageService";
import { AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";
import { veniceFetch } from "./veniceClient";
import { extractImages, galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";

export const refreshGallery = async (dispatch: AppDispatch) => {
  const items = await StorageService.getItems("images");
  dispatch({ type: "SET_GALLERY", items });
};

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

export const upscaleGalleryImage = async (
  item: GalleryImage,
  dispatch: AppDispatch,
  model = "upscale-model",
  onComplete?: () => void,
  onError?: (err: Error) => void
) => {
  try {
    const { data } = await veniceFetch("/image/upscale", {
      method: "POST",
      body: {
        model,
        image: item.image,
        return_binary: false,
      },
      dispatch,
    });

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
  } catch (err: any) {
    console.error("Upscale failed", err);
    if (onError) onError(err);
    throw err;
  }
};

export const downloadAllGallery = async (items: GalleryImage[], addToast: (msg: string, type: 'info'|'success'|'error') => void) => {
  if (!items.length) {
    addToast("No images to download.", "info");
    return;
  }
  
  if (items.length > 50) {
    addToast("Downloading first 50 images. Large downloads may take time.", "info");
  }

  // To prevent freezing the UI, download them with a small delay
  const max = Math.min(items.length, 50);
  for (let i = 0; i < max; i++) {
    const item = items[i];
    await downloadImage(item.image, galleryFilename(item, item.timestamp));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  addToast(`Saved ${max} images.`, "success");
};
