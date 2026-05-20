/**
 * Desktop bridge: detects the Electron runtime and provides a unified
 * accessor for the Electron preload API.
 *
 * In web/browser mode all functions fall back to no-ops or web defaults.
 * Import `./types/desktop` to get full TypeScript types for window.veniceForge.
 */
import "../types/desktop";

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.veniceForge?.isDesktop === true;
}

// Module-level cached proxy base URL (initialised by initDesktopBridge)
let veniceProxyBase = "/api/venice";

/** Returns the Venice proxy base URL.  Updated by initDesktopBridge in desktop mode. */
export function getVeniceProxyBase(): string {
  return veniceProxyBase;
}

/**
 * Must be called once at app startup (in App.tsx useEffect).
 * Fetches the local proxy URL from the main process and caches it.
 */
export async function initDesktopBridge(): Promise<void> {
  if (!isElectron()) return;
  try {
    veniceProxyBase = await window.veniceForge!.getProxyUrl();
  } catch (err) {
    console.error("[DesktopBridge] Could not get proxy URL:", err);
  }
}

/** API key helpers (no-ops / stubs in web mode) */
export const desktopApiKey = {
  isConfigured(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.apiKey.isConfigured();
  },
  set(key: string): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.apiKey.set(key);
  },
  delete(): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.apiKey.delete();
  },
  test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, message: "Not in desktop mode" });
    return window.veniceForge!.apiKey.test();
  },
};

/** App info helpers */
export const desktopApp = {
  getVersion(): Promise<string> {
    if (!isElectron()) return Promise.resolve("web");
    return window.veniceForge!.app.getVersion();
  },
  getDataPath(): Promise<string> {
    if (!isElectron()) return Promise.resolve("IndexedDB (browser)");
    return window.veniceForge!.app.getDataPath();
  },
  isEncryptionAvailable(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.app.isEncryptionAvailable();
  },
};

/** File export/import helpers */
export const desktopFiles = {
  async exportJson(data: unknown, defaultPath = "venice-forge-export.json"): Promise<boolean> {
    const json = JSON.stringify(data, null, 2);
    if (!isElectron()) {
      // Web fallback: trigger a browser download
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    }
    const result = await window.veniceForge!.files.saveJsonFile(json, defaultPath);
    return result.ok;
  },

  async importJson(): Promise<unknown | null> {
    if (!isElectron()) return null;
    const result = await window.veniceForge!.files.loadJsonFile();
    if (result.canceled || !result.data) return null;
    return JSON.parse(result.data);
  },
};
