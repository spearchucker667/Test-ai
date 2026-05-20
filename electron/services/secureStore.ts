/**
 * SecureStore: Stores the Venice API key encrypted using Electron's safeStorage
 * (DPAPI on Windows, Keychain on macOS, Secret Service on Linux).
 * Falls back to plaintext in userData with a clear warning if safeStorage is unavailable.
 *
 * The key is NEVER exposed to the renderer process.
 */
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

const STORE_FILE = "secure-prefs.json";

function getStorePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getStorePath(), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, string>): void {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    // Restrict file to owner read/write only on POSIX systems.
    // Ignored on Windows (which uses ACLs via NTFS / DPAPI instead).
    mode: 0o600,
  });
}

export function setApiKey(key: string): void {
  const store = readStore();
  if (safeStorage.isEncryptionAvailable()) {
    store["apiKey"] = safeStorage.encryptString(key).toString("base64");
    store["apiKeyEncrypted"] = "true";
  } else {
    // Fallback: plaintext with warning (safeStorage unavailable on some Linux setups)
    console.warn(
      "[SecureStore] safeStorage unavailable – storing key without OS encryption. " +
        "Data is still in a user-only file."
    );
    store["apiKey"] = key;
    store["apiKeyEncrypted"] = "false";
  }
  writeStore(store);
}

export function getApiKey(): string | null {
  const store = readStore();
  const raw = store["apiKey"];
  if (!raw) return null;

  if (store["apiKeyEncrypted"] === "true") {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch (err) {
      console.error(
        "[SecureStore] Failed to decrypt API key. The stored data may be corrupted or the OS credential changed.",
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }
  return raw;
}

export function deleteApiKey(): void {
  const store = readStore();
  delete store["apiKey"];
  delete store["apiKeyEncrypted"];
  writeStore(store);
}

export function isApiKeyConfigured(): boolean {
  const store = readStore();
  return !!store["apiKey"];
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
