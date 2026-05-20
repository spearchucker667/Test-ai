/**
 * TypeScript declarations for the Electron preload bridge.
 * Augments the Window interface so renderer code is fully typed.
 */

export interface VeniceForgeApiKey {
  isConfigured(): Promise<boolean>;
  set(key: string): Promise<{ ok: boolean }>;
  delete(): Promise<{ ok: boolean }>;
  test(): Promise<{ ok: boolean; status?: number; message: string }>;
}

export interface VeniceForgeApp {
  getVersion(): Promise<string>;
  getDataPath(): Promise<string>;
  isEncryptionAvailable(): Promise<boolean>;
}

export interface VeniceForgeFiles {
  /** Shows a save dialog then writes the JSON string to the chosen path. */
  saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  /** Shows an open dialog then reads the file, returning its content. */
  loadJsonFile(): Promise<{ canceled: boolean; data?: string }>;
}

export interface VeniceForge {
  readonly isDesktop: true;
  getProxyUrl(): Promise<string>;
  apiKey: VeniceForgeApiKey;
  app: VeniceForgeApp;
  files: VeniceForgeFiles;
}

declare global {
  interface Window {
    veniceForge?: VeniceForge;
  }
}
