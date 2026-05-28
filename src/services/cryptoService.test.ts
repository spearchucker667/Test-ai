/** @fileoverview Unit tests for cryptoService encryption and decryption. */

import { describe, expect, it, beforeEach } from "vitest";
// @ts-expect-error — fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import { encryptData, decryptData } from "./cryptoService";

/** Resets the IndexedDB instance before each test. */
beforeEach(() => {
  global.indexedDB = new FDBFactory();
});

/** Tests for cryptoService AES-GCM encryption operations. */
describe("cryptoService", () => {
  /** Verifies roundtrip encryption and decryption of plain objects. */
  it("roundtrips plain objects through encrypt/decrypt", async () => {
    const original = { id: "test-1", message: "hello world", nested: { a: 1 } };
    const encrypted = await encryptData(original);
    expect(encrypted).toHaveProperty("_encrypted", true);
    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("data");
    const decrypted = await decryptData(encrypted);
    expect(decrypted).toEqual(original);
  });

  /** Verifies roundtrip encryption and decryption of strings. */
  it("roundtrips strings", async () => {
    const original = "just a string";
    const encrypted = await encryptData(original);
    const decrypted = await decryptData(encrypted);
    expect(decrypted).toEqual(original);
  });

  /** Verifies that non-encrypted payloads pass through decryptData unchanged. */
  it("returns non-encrypted payload unchanged from decryptData", async () => {
    const payload = { foo: "bar" };
    const result = await decryptData(payload);
    expect(result).toEqual(payload);
  });

  /** Verifies null return for corrupted encrypted payloads. */
  it("returns null for corrupted encrypted payload", async () => {
    const corrupted = { _encrypted: true, iv: [0, 1, 2], data: [3, 4, 5] };
    const result = await decryptData(corrupted);
    expect(result).toBeNull();
  });

  /** Verifies null return for null input to decryptData. */
  it("returns null for null input", async () => {
    const result = await decryptData(null);
    expect(result).toBeNull();
  });
});
