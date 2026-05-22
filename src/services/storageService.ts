import { DB_NAME, DB_VERSION, STORE_NAMES } from "../constants/venice";
import { encryptData, decryptData } from "./cryptoService";

const ENCRYPTED_STORES = ["chats", "settings", "images"];

const StorageService = {
  db: null as IDBDatabase | null,
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
              "This may indicate key-store loss, data corruption, or a browser/profile reset. The records are still stored on disk."
            );
          }
          results = decrypted.filter(Boolean);
        }
        resolve(results.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)));
      };
      req.onerror = () => reject(req.error);
    });
  },
  async deleteItem(store: string, id: string): Promise<boolean> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },
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
