import { describe, it, expect } from "vitest";
import { galleryFilename, normalizeImageData, extractImages } from "./image";

describe("galleryFilename", () => {
  it("builds a filename from item model and id", () => {
    const item = { model: "fluently-xl", id: "abc-123", prompt: "a cat", timestamp: 1000 };
    expect(galleryFilename(item)).toBe("fluently-xl-abc-123.png");
  });

  it("falls back to 'venice' when model is absent", () => {
    const item = { id: "xyz", prompt: "test", timestamp: 1 };
    expect(galleryFilename(item)).toMatch(/^venice-xyz\.png$/);
  });

  it("uses the index when id is absent", () => {
    const item = { model: "test-model", prompt: "p", timestamp: 1 };
    expect(galleryFilename(item, 5)).toBe("test-model-5.png");
  });

  it("sanitises unsafe characters in model and id", () => {
    const item = { model: "my model/v1", id: "img 001", prompt: "x", timestamp: 1 };
    expect(galleryFilename(item)).not.toMatch(/[ /]/);
  });

  it("does NOT use item as a plain string (BUG-002 regression guard)", () => {
    const item = { model: "fluently-xl", id: "correct-id", prompt: "some prompt", timestamp: 9999 };
    // Passing item correctly should yield the model/id, not 'venice-undefined'
    const name = galleryFilename(item);
    expect(name).not.toContain("undefined");
    expect(name).toBe("fluently-xl-correct-id.png");
  });
});

describe("normalizeImageData", () => {
  it("passes through data: URLs unchanged", () => {
    const url = "data:image/png;base64,abc123";
    expect(normalizeImageData(url)).toBe(url);
  });

  it("passes through https URLs unchanged", () => {
    const url = "https://example.com/img.png";
    expect(normalizeImageData(url)).toBe(url);
  });

  it("wraps a bare base64 string in a data URL", () => {
    // normalizeImageData requires length > 80 to treat as raw base64
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAA==";
    const result = normalizeImageData(b64);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null for empty input", () => {
    expect(normalizeImageData(null)).toBeNull();
    expect(normalizeImageData("")).toBeNull();
  });

  it("unwraps nested object shapes", () => {
    const result = normalizeImageData({ b64_json: "data:image/png;base64,abc" });
    expect(result).toBe("data:image/png;base64,abc");
  });
});

describe("extractImages", () => {
  it("extracts images from a data array", () => {
    const payload = { data: [{ b64_json: "data:image/png;base64,X" }] };
    expect(extractImages(payload)).toEqual(["data:image/png;base64,X"]);
  });

  it("deduplicates identical image URLs", () => {
    const url = "data:image/png;base64,Z";
    const payload = { data: [{ b64_json: url }, { b64_json: url }] };
    expect(extractImages(payload)).toHaveLength(1);
  });

  it("returns empty array for empty payload", () => {
    expect(extractImages({})).toEqual([]);
    expect(extractImages(null)).toEqual([]);
  });
});
