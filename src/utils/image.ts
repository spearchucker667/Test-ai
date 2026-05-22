/** @fileoverview Image normalization, extraction, and filename utilities for gallery items. */

/**
 * Strips the data URL scheme and base64 prefix from an image string.
 *
 * @param dataUrl A string that may contain a data URL prefix.
 * @returns The raw base64 payload with the prefix removed.
 */
export function stripDataUrlPrefix(dataUrl: string) {
  return String(dataUrl || "").replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

/**
 * Normalizes various image payload shapes into a standard data URL or HTTPS URL.
 *
 * @param value An unknown value that may represent image data.
 * @returns A normalized data URL or HTTPS URL, or null if the value is unrecognisable.
 */
export function normalizeImageData(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return value;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      return "data:image/png;base64," + value.replace(/\s/g, "");
    }
    return null;
  }
  if (typeof value === "object") {
    return normalizeImageData(
      value.b64_json ||
        value.b64 ||
        value.base64 ||
        value.dataBase64 ||  // Electron: binary PNG response serialized to base64
        value.dataUrl ||     // Web: binary PNG response converted to data URL
        value.image ||
        value.url ||
        value.data ||
        value.content
    );
  }
  return null;
}

/**
 * Extracts and deduplicates image URLs from a Venice API payload.
 *
 * @param payload A response payload that may contain images in various fields.
 * @returns An array of unique normalised image URLs.
 */
export function extractImages(payload: any): string[] {
  const candidates: string[] = [];
  const push = (x: any) => {
    const normalized = normalizeImageData(x);
    if (normalized) candidates.push(normalized);
  };

  if (Array.isArray(payload?.images)) payload.images.forEach(push);
  if (Array.isArray(payload?.data)) payload.data.forEach(push);
  if (payload?.image) push(payload?.image);
  if (payload?.dataUrl) push(payload?.dataUrl);       // web: binary PNG response
  if (payload?.dataBase64) push(payload?.dataBase64); // Electron: binary PNG response
  if (payload?.b64_json) push(payload?.b64_json);
  if (payload?.base64) push(payload?.base64);
  if (payload?.url) push(payload?.url);

  if (!candidates.length && typeof payload === "string") push(payload);
  if (!candidates.length && payload && typeof payload === "object") {
    Object.values(payload).forEach((v) => {
      if (Array.isArray(v)) v.forEach(push);
      else push(v);
    });
  }
  return Array.from(new Set(candidates));
}

/**
 * Builds a safe filename for a gallery image from its metadata.
 *
 * @param item A gallery record containing model and id fields.
 * @param index Fallback numeric index when id is missing.
 * @param suffix Optional suffix to append before the extension.
 * @returns A sanitised PNG filename.
 */
export function galleryFilename(item: any, index = 0, suffix = "") {
  const safeModel = String(item?.model || "venice").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
  const id = String(item?.id || index).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  return `${safeModel}-${id}${suffix}.png`;
}
