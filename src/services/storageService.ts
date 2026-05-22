/** @fileoverview IndexedDB storage service with transparent at-rest encryption for sensitive stores. */

import { DB_NAME, DB_VERSION, STORE_NAMES } from "../constants/venice";
import { encryptData, decryptData } from "./cryptoService";

/** List of store names whose records are encrypted before persistence. */
const ENCRYPTED_STORES = ["chats", "settings", "images"];

/**
 * Provides CRUD operations over IndexedDB with automatic encryption for
 * configured object stores.
 */
const StorageService = {
  /** The open IndexedDB database instance, cached after first open. */
  db: null as IDBDatabase | null,

  /**
   * Opens or returns the cached IndexedDB connection.
   * @returns A promise resolving to the IDBDatabase instance.
   */
  openDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        STORE_NAMES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: "id" });
          }
        });
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Saves an item to the specified store, encrypting if required.
   * @param store The target object store name.
   * @param item The record to persist.
   * @returns A promise resolving to the saved record with generated id and timestamp.
   */
  async saveItem(store: string, item: any): Promise<any> {
    const db = await this.openDB();
    const id = item.id || crypto.randomUUID();
    const timestamp = item.timestamp || Date.now();

    let payload = { ...item, id, timestamp };
    if (ENCRYPTED_STORES.includes(store)) {
      const encryptedData = await encryptData(payload);
      payload = { id, timestamp, data: encryptedData, _isEncryptedWrapper: true };
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(payload);
      tx.oncomplete = () => resolve({ ...item, id, timestamp }); // Return unencrypted to caller
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Retrieves all items from a store, decrypting encrypted records.
   * @param store The object store name to query.
   * @returns A promise resolving to an array of decrypted records sorted by timestamp descending.
   */
  async getItems(store: string): Promise<any[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = async () => {
        let results = req.result || [];
        if (ENCRYPTED_STORES.includes(store)) {
          const decrypted = await Promise.all(
            results.map(async (row: any) => {
               if (row._isEncryptedWrapper) {
                  const val = await decryptData(row.data);
                  return val === null ? null : val;
               }
               return await decryptData(row);
            })
          );
          // BUG-001: surface silent decrypt failures so the user is aware data
          // could not be read (e.g. after key-store loss, data corruption, or browser/profile reset).
          const failCount = decrypted.filter((v) => v === null).length;
          if (failCount > 0) {
            console.warn(
              `[storageService] ${failCount} record(s) in "${store}" could not be decrypted and were skipped. ` +
              "This may indicate key-store loss, data corruption, or a browser/profile reset. The records are still persisted in IndexedDB."
            );
          }
          results = decrypted.filter(Boolean);
        }
        resolve(results.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)));
      };
      req.onerror = () => reject(req.error);
    });
  },

  /**
   * Deletes a single record from a store.
   * @param store The object store name.
   * @param id The unique identifier of the record to delete.
   * @returns A promise resolving to true on success.
   */
  async deleteItem(store: string, id: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  /**
   * Clears all records from the specified store.
   * @param store The object store name to clear.
   * @returns A promise resolving to true on success.
   */
  async clearStore(store: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },
};

export default StorageService;
