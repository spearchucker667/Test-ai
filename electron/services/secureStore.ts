/** @fileoverview Manages encrypted storage of API keys using Electron
 *  safeStorage (DPAPI on Windows, Keychain on macOS, Secret Service on Linux). */

// Code Owner: fayeblade (@spearchucker667)
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

/** Name of the JSON file used for secure preferences storage. */
const STORE_FILE = "secure-prefs.json";

/** Whether plaintext fallback is permitted when OS encryption is unavailable. */
const ALLOW_PLAINTEXT_FALLBACK =
  process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE === "true";

/** Describes the current secure storage mode. */
export type SecureStorageMode = "encrypted" | "unavailable" | "plaintext-fallback";

/** Stores the last error encountered while reading or decrypting the preference file. */
let lastReadError: string | null = null;

/** Returns the absolute path to the secure preferences file. */
function getStorePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

/** Reads and parses the secure preferences file.
 *  @returns A record of string key-value pairs.
 */
function readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getStorePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      lastReadError = "Secure preferences file does not contain an object.";
      return {};
    }
    lastReadError = null;
    return parsed as Record<string, string>;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      lastReadError = null;
    } else {
      lastReadError = "Secure preferences file is corrupted or unreadable.";
    }
    return {};
  }
}

/** Persists the secure preferences object to disk with restricted permissions.
 *  @param data The key-value record to write.
 */
function writeStore(data: Record<string, string>): void {
  const storePath = getStorePath();
  const tempPath = `${storePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    // Restrict file to owner read/write only on POSIX systems.
    // Ignored on Windows (which uses ACLs via NTFS / DPAPI instead).
    mode: 0o600,
  });
  fs.renameSync(tempPath, storePath);
}

/** Encrypts and stores the Venice API key using OS-level encryption when possible.
 *  @param key The API key to store.
 */
export function setApiKey(key: string): void {
  const store = readStore();
  if (safeStorage.isEncryptionAvailable()) {
    store["apiKey"] = safeStorage.encryptString(key).toString("base64");
    store["apiKeyEncrypted"] = "true";
  } else {
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error(
        `${process.platform === "win32" ? "Windows" : "macOS"} secure storage is unavailable. Venice Forge will not store the API key without OS encryption.`
      );
    }
    if (!ALLOW_PLAINTEXT_FALLBACK) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented plaintext fallback."
      );
    }
    store["apiKey"] = key;
    store["apiKeyEncrypted"] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts the stored Venice API key, if available.
 *  @returns The decrypted key, or null if missing or corrupted.
 */
export function getApiKey(): string | null {
  const store = readStore();
  const raw = store["apiKey"];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store["apiKeyEncrypted"] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      lastReadError =
        "Failed to decrypt API key. The stored data may be corrupted or the OS credential changed.";
      return null;
    }
  }

  // Reject plaintext unconditionally on Windows and macOS.
  if (process.platform === "win32" || process.platform === "darwin") {
    lastReadError = "Plaintext API key storage is not allowed on this platform.";
    return null;
  }

  return raw;
}

/** Removes the stored Venice API key from secure preferences. */
export function deleteApiKey(): void {
  const store = readStore();
  delete store["apiKey"];
  delete store["apiKeyEncrypted"];
  writeStore(store);
}

// ── Jina API key storage (same safeStorage policy) ──

/** Encrypts and stores the Jina API key using OS-level encryption when possible.
 *  @param key The Jina API key to store.
 */
export function setJinaApiKey(key: string): void {
  const store = readStore();
  if (safeStorage.isEncryptionAvailable()) {
    store["jinaApiKey"] = safeStorage.encryptString(key).toString("base64");
    store["jinaApiKeyEncrypted"] = "true";
  } else {
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error(
        `${process.platform === "win32" ? "Windows" : "macOS"} secure storage is unavailable. Venice Forge will not store the API key without OS encryption.`
      );
    }
    if (!ALLOW_PLAINTEXT_FALLBACK) {
      throw new Error(
        "OS secure storage is unavailable. Set VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE=true to allow documented plaintext fallback."
      );
    }
    store["jinaApiKey"] = key;
    store["jinaApiKeyEncrypted"] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts the stored Jina API key, if available.
 *  @returns The decrypted key, or null if missing or corrupted.
 */
export function getJinaApiKey(): string | null {
  const store = readStore();
  const raw = store["jinaApiKey"];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store["jinaApiKeyEncrypted"] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      lastReadError = "Failed to decrypt Jina API key. The stored data may be corrupted or the OS credential changed.";
      return null;
    }
  }

  if (process.platform === "win32" || process.platform === "darwin") {
    lastReadError = "Plaintext Jina API key storage is not allowed on this platform.";
    return null;
  }

  return raw;
}

/** Removes the stored Jina API key from secure preferences. */
export function deleteJinaApiKey(): void {
  const store = readStore();
  delete store["jinaApiKey"];
  delete store["jinaApiKeyEncrypted"];
  writeStore(store);
}

/** Checks whether a usable Jina API key is currently stored. */
export function isJinaApiKeyConfigured(): boolean {
  return getJinaApiKey() !== null;
}

/** Checks whether a usable Venice API key is currently stored. */
export function isApiKeyConfigured(): boolean {
  // Must test actual decryptability, not just raw byte presence.
  // A corrupted or DPAPI-unreadable blob would pass the raw check but fail here.
  return getApiKey() !== null;
}

/** Checks whether OS-level encryption is available on this platform. */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/** Determines the active secure storage mode based on platform and availability.
 *  @returns The current storage mode identifier.
 */
export function getStorageMode(): SecureStorageMode {
  if (safeStorage.isEncryptionAvailable()) return "encrypted";
  if (process.platform !== "win32" && process.platform !== "darwin" && ALLOW_PLAINTEXT_FALLBACK) return "plaintext-fallback";
  return "unavailable";
}

/** Returns the current status of the secure store, including any corruption errors.
 *  @returns A status object describing mode, availability, and errors.
 */
export function getSecureStoreStatus(): {
  mode: SecureStorageMode;
  encryptionAvailable: boolean;
  corrupted: boolean;
  error: string | null;
} {
  // Calling getApiKey() runs readStore() + decryption, capturing both
  // file-read errors (via lastReadError reset) and DPAPI decrypt errors.
  getApiKey();
  return {
    mode: getStorageMode(),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    corrupted: !!lastReadError,
    error: lastReadError,
  };
}
