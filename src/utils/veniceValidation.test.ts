/** @fileoverview Unit tests for Venice API response validators. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidModelListResponse,
  isValidImageResponse,
  isValidChatResponse,
  isValidSearchResponse,
} from "./veniceValidation";

/** Tests for all Venice response validators. */
describe("veniceValidation", () => {
  /** Suppresses console warnings before each test to keep output clean. */
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  /** Tests for the isValidModelListResponse guard. */
  describe("isValidModelListResponse", () => {
    /** Verifies that a payload with a data array is accepted. */
    it("accepts a payload with a data array", () => {
      expect(isValidModelListResponse({ data: [{ id: "model-1" }] })).toBe(true);
    });

    /** Verifies that an empty data array is accepted. */
    it("accepts an empty data array", () => {
      expect(isValidModelListResponse({ data: [] })).toBe(true);
    });

    /** Verifies that a bare array (alternate Venice shape) is accepted. */
    it("accepts a bare array (alternate Venice shape)", () => {
      expect(isValidModelListResponse([{ id: "model-1" }])).toBe(true);
    });

    /** Verifies that null is rejected. */
    it("rejects null", () => {
      expect(isValidModelListResponse(null)).toBe(false);
    });

    /** Verifies that an object without a data array is rejected. */
    it("rejects an object with no data array", () => {
      expect(isValidModelListResponse({ models: [] })).toBe(false);
    });

    /** Verifies that a plain string is rejected. */
    it("rejects a plain string", () => {
      expect(isValidModelListResponse("not-an-object")).toBe(false);
    });
  });

  /** Tests for the isValidImageResponse guard. */
  describe("isValidImageResponse", () => {
    /** Verifies that a payload with an images array is accepted. */
    it("accepts payload with images array", () => {
      expect(isValidImageResponse({ images: ["data:image/png;base64,abc"] })).toBe(true);
    });

    /** Verifies that a payload with a data array is accepted. */
    it("accepts payload with data array", () => {
      expect(isValidImageResponse({ data: [{ b64_json: "abc" }] })).toBe(true);
    });

    /** Verifies that a payload with an image string is accepted. */
    it("accepts payload with image string", () => {
      expect(isValidImageResponse({ image: "data:image/png;base64,abc" })).toBe(true);
    });

    /** Verifies that a payload with a b64_json string is accepted. */
    it("accepts payload with b64_json string", () => {
      expect(isValidImageResponse({ b64_json: "abc" })).toBe(true);
    });

    /** Verifies that a payload with a URL string is accepted. */
    it("accepts payload with url string", () => {
      expect(isValidImageResponse({ url: "https://example.com/img.png" })).toBe(true);
    });

    /** Verifies that a payload with a dataUrl (web binary PNG) is accepted. */
    it("accepts payload with dataUrl (web binary PNG response)", () => {
      expect(isValidImageResponse({ dataUrl: "data:image/png;base64,abc" })).toBe(true);
    });

    /** Verifies that a payload with dataBase64 (Electron binary PNG) is accepted. */
    it("accepts payload with dataBase64 (Electron binary PNG response)", () => {
      expect(isValidImageResponse({ dataBase64: "iVBORw0KGgo=" })).toBe(true);
    });

    /** Verifies that null is rejected. */
    it("rejects null", () => {
      expect(isValidImageResponse(null)).toBe(false);
    });

    /** Verifies that an empty object is rejected. */
    it("rejects an empty object", () => {
      expect(isValidImageResponse({})).toBe(false);
    });

    /** Verifies that an empty images array is rejected. */
    it("rejects empty images array", () => {
      expect(isValidImageResponse({ images: [] })).toBe(false);
    });
  });

  /** Tests for the isValidChatResponse guard. */
  describe("isValidChatResponse", () => {
    /** Verifies that a payload with non-empty choices is accepted. */
    it("accepts a payload with non-empty choices", () => {
      expect(
        isValidChatResponse({ choices: [{ message: { content: "Hello" } }] })
      ).toBe(true);
    });

    /** Verifies that null is rejected. */
    it("rejects null", () => {
      expect(isValidChatResponse(null)).toBe(false);
    });

    /** Verifies that a payload missing choices is rejected. */
    it("rejects missing choices", () => {
      expect(isValidChatResponse({ id: "chatcmpl-1" })).toBe(false);
    });

    /** Verifies that an empty choices array is rejected. */
    it("rejects empty choices array", () => {
      expect(isValidChatResponse({ choices: [] })).toBe(false);
    });
  });

  /** Tests for the isValidSearchResponse guard. */
  describe("isValidSearchResponse", () => {
    /** Verifies that a payload with a results array is accepted. */
    it("accepts payload with results array", () => {
      expect(isValidSearchResponse({ results: [{ title: "Test" }] })).toBe(true);
    });

    /** Verifies that a payload with a data array is accepted. */
    it("accepts payload with data array", () => {
      expect(isValidSearchResponse({ data: [] })).toBe(true);
    });

    /** Verifies that a payload with an items array is accepted. */
    it("accepts payload with items array", () => {
      expect(isValidSearchResponse({ items: [] })).toBe(true);
    });

    /** Verifies that a bare array is accepted. */
    it("accepts a bare array", () => {
      expect(isValidSearchResponse([])).toBe(true);
    });

    /** Verifies that null is rejected. */
    it("rejects null", () => {
      expect(isValidSearchResponse(null)).toBe(false);
    });

    /** Verifies that an object with no recognised results field is rejected. */
    it("rejects an object with no recognised results field", () => {
      expect(isValidSearchResponse({ query: "test" })).toBe(false);
    });
  });
});
