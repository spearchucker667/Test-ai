/** @fileoverview IndexedDB at-rest encryption for chats and settings using AES-GCM. */

// Code Owner: fayeblade (@spearchucker667)
const ALGO = "AES-GCM";
const KEY_NAME = "venice-forge-key";

/**
 * Retrieves an existing AES-GCM key from IndexedDB or generates a new one.
 * @returns A promise resolving to the CryptoKey.
 */
async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openKeyDB();
  const existing = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const req = tx.objectStore("keys").get(KEY_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (existing) return existing.key;
  const key = await crypto.subtle.generateKey(
    { name: ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return new Promise<CryptoKey>((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    const putReq = tx.objectStore("keys").put({ id: KEY_NAME, key });
    putReq.onsuccess = () => resolve(key);
    putReq.onerror = () => reject(putReq.error);
  });
}

/**
 * Opens the dedicated key storage IndexedDB.
 * @returns A promise resolving to the key database.
 */
function openKeyDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("venice_forge_keys", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("keys", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Encrypts a JavaScript value using AES-GCM.
 * @param data The value to encrypt.
 * @returns A promise resolving to the encrypted payload wrapper.
 */
export async function encryptData(data: any): Promise<any> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded
  );

  return {
    _encrypted: true,
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts an AES-GCM encrypted payload back into its original value.
 * @param encryptedPayload The wrapper object produced by encryptData.
 * @returns A promise resolving to the decrypted value, or null on failure.
 */
export async function decryptData(encryptedPayload: any): Promise<any> {
  if (!encryptedPayload || !encryptedPayload._encrypted) return encryptedPayload;
  try {
    const key = await getOrCreateKey();
    const iv = new Uint8Array(encryptedPayload.iv);
    const encrypted = new Uint8Array(encryptedPayload.data);
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      encrypted
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    // Redacted: do not log decryption error details in production.
    return null;
  }
}
