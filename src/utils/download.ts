/** @fileoverview Browser helpers for downloading images and copying text to the clipboard. */

export interface DownloadImageResult {
  confirmed: boolean;
  usedFallback: boolean;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Downloads an image by fetching it as a blob and triggering a browser download.
 *
 * Falls back to a direct URL download if the blob fetch fails. The fallback starts
 * a browser download/navigation, but cannot confirm that the file was saved.
 *
 * @param url The image URL to download.
 * @param filename The suggested filename for the downloaded file.
 */
export async function downloadImage(url: string, filename: string): Promise<DownloadImageResult> {
  if (!url) throw new Error("No image URL to download.");

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image download failed with HTTP ${res.status}.`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    triggerDownload(blobUrl, filename);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    return { confirmed: true, usedFallback: false };
  } catch {
    triggerDownload(url, filename);
    return { confirmed: false, usedFallback: true };
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
