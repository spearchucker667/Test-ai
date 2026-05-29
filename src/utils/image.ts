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
export function normalizeImageData(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) return value;
    if (/^https:\/\//i.test(value)) return value;
    if (value.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      return "data:image/png;base64," + value.replace(/\s/g, "");
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizeImageData(
      record.b64_json ||
        record.b64 ||
        record.base64 ||
        record.dataBase64 ||  // Electron: binary PNG response serialized to base64
        record.dataUrl ||     // Web: binary PNG response converted to data URL
        record.image ||
        record.url ||
        record.data ||
        record.content
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
export function extractImages(payload: unknown): string[] {
  const candidates: string[] = [];
  const push = (x: unknown) => {
    const normalized = normalizeImageData(x);
    if (normalized) candidates.push(normalized);
  };

  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : null;

  if (Array.isArray(record?.images)) record.images.forEach(push);
  if (Array.isArray(record?.data)) record.data.forEach(push);
  if (record?.image) push(record.image);
  if (record?.dataUrl) push(record.dataUrl);       // web: binary PNG response
  if (record?.dataBase64) push(record.dataBase64); // Electron: binary PNG response
  if (record?.b64_json) push(record.b64_json);
  if (record?.base64) push(record.base64);
  if (record?.url) push(record.url);

  if (!candidates.length && typeof payload === "string") push(payload);
  if (!candidates.length && record) {
    Object.values(record).forEach((v) => {
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
export function galleryFilename(item: unknown, index = 0, suffix = "") {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const safeModel = String(record.model || "venice").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
  const id = String(record.id || index).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  return `${safeModel}-${id}${suffix}.png`;
}
