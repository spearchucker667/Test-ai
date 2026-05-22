/** @fileoverview Unit tests for image normalization, extraction, and filename utilities. */

import { describe, it, expect } from "vitest";
import { galleryFilename, normalizeImageData, extractImages } from "./image";

/** Tests for the galleryFilename helper. */
describe("galleryFilename", () => {
  /** Verifies that a filename is built from the item model and id. */
  it("builds a filename from item model and id", () => {
    const item = { model: "fluently-xl", id: "abc-123", prompt: "a cat", timestamp: 1000 };
    expect(galleryFilename(item)).toBe("fluently-xl-abc-123.png");
  });

  /** Verifies that the model falls back to "venice" when absent. */
  it("falls back to 'venice' when model is absent", () => {
    const item = { id: "xyz", prompt: "test", timestamp: 1 };
    expect(galleryFilename(item)).toMatch(/^venice-xyz\.png$/);
  });

  /** Verifies that the index parameter is used as a fallback id. */
  it("uses the index when id is absent", () => {
    const item = { model: "test-model", prompt: "p", timestamp: 1 };
    // When item.id is undefined, the index parameter is used as the fallback id
    expect(galleryFilename(item, 5)).toBe("test-model-5.png");
  });

  /** Verifies that unsafe characters are sanitised from model and id. */
  it("sanitises unsafe characters in model and id", () => {
    const item = { model: "my model/v1", id: "img 001", prompt: "x", timestamp: 1 };
    expect(galleryFilename(item)).not.toMatch(/[ /]/);
  });

  /**
   * Verifies that passing an item object yields the correct model/id filename.
   *
   * BUG-002 regression guard.
   */
  it("does NOT use item as a plain string (BUG-002 regression guard)", () => {
    const item = { model: "fluently-xl", id: "correct-id", prompt: "some prompt", timestamp: 9999 };
    // Passing item correctly should yield the model/id, not 'venice-undefined'
    const name = galleryFilename(item);
    expect(name).not.toContain("undefined");
    expect(name).toBe("fluently-xl-correct-id.png");
  });
});

/** Tests for the normalizeImageData helper. */
describe("normalizeImageData", () => {
  /** Verifies that data URLs pass through unchanged. */
  it("passes through data: URLs unchanged", () => {
    const url = "data:image/png;base64,abc123";
    expect(normalizeImageData(url)).toBe(url);
  });

  /** Verifies that HTTPS URLs pass through unchanged. */
  it("passes through https URLs unchanged", () => {
    const url = "https://example.com/img.png";
    expect(normalizeImageData(url)).toBe(url);
  });

  /** Verifies that bare base64 strings are wrapped in a PNG data URL. */
  it("wraps a bare base64 string in a data URL", () => {
    // normalizeImageData requires length > 80 to treat as raw base64
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAA==";
    const result = normalizeImageData(b64);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/^data:image\/png;base64,/);
  });

  /** Verifies that empty or nullish input returns null. */
  it("returns null for empty input", () => {
    expect(normalizeImageData(null)).toBeNull();
    expect(normalizeImageData("")).toBeNull();
  });

  /** Verifies that nested object shapes are unwrapped correctly. */
  it("unwraps nested object shapes", () => {
    const result = normalizeImageData({ b64_json: "data:image/png;base64,abc" });
    expect(result).toBe("data:image/png;base64,abc");
  });
});

/** Tests for the extractImages helper. */
describe("extractImages", () => {
  /** Verifies that images are extracted from a data array. */
  it("extracts images from a data array", () => {
    const payload = { data: [{ b64_json: "data:image/png;base64,X" }] };
    expect(extractImages(payload)).toEqual(["data:image/png;base64,X"]);
  });

  /** Verifies that duplicate image URLs are deduplicated. */
  it("deduplicates identical image URLs", () => {
    const url = "data:image/png;base64,Z";
    const payload = { data: [{ b64_json: url }, { b64_json: url }] };
    expect(extractImages(payload)).toHaveLength(1);
  });

  /** Verifies that empty or null payloads yield an empty array. */
  it("returns empty array for empty payload", () => {
    expect(extractImages({})).toEqual([]);
    expect(extractImages(null)).toEqual([]);
  });
});
