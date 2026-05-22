/** @fileoverview Browser helpers for downloading images and copying text to the clipboard. */

/**
 * Downloads an image by fetching it as a blob and triggering a browser download.
 *
 * Falls back to a direct URL download if the blob fetch fails.
 *
 * @param url The image URL to download.
 * @param filename The suggested filename for the downloaded file.
 */
export async function downloadImage(url: string, filename: string) {
  if (!url) return;

  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (e) {
    // Fallback to url directly
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/**
 * Copies the provided text to the system clipboard.
 *
 * @param value The string to copy.
 * @returns A promise that resolves when the text has been written.
 */
export function copyText(value: string) {
  return navigator.clipboard.writeText(String(value || ""));
}
