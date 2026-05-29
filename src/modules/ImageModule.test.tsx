// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ImageModule } from "./ImageModule";
import { initialState } from "../state/appReducer";
import { generateImageWithWatermarkFallback } from "../services/imageWorkflowService";

vi.mock("../services/modelService", () => ({ refreshModels: vi.fn() }));

vi.mock("../services/imageWorkflowService", () => ({
  generateImageWithWatermarkFallback: vi.fn(),
  saveImageRecord: vi.fn(),
  refreshGallery: vi.fn(),
  upscaleGalleryImage: vi.fn(),
}));

vi.mock("../services/storageService", () => ({
  default: {
    deleteItem: vi.fn(),
    getItems: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../utils/download", () => ({ downloadImage: vi.fn() }));

const mockDispatch = vi.fn();

function renderImageModule() {
  return render(
    <ImageModule
      state={{
        ...initialState,
        usingFallbackModels: false,
        imageDraft: {
          ...initialState.imageDraft,
          prompt: "A glass city at sunrise",
        },
      }}
      dispatch={mockDispatch}
    />
  );
}

describe("ImageModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateImageWithWatermarkFallback).mockImplementation(
      (_model, _draft, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Request aborted", "AbortError")),
            { once: true }
          );
        }) as Promise<never>
    );
  });

  afterEach(() => {
    cleanup();
  });

  // BUG-001 regression guard: cancel must leave the form usable even when run id is invalidated.
  it("re-enables image generation immediately after cancel", async () => {
    renderImageModule();

    await userEvent.click(screen.getByRole("button", { name: /generate/i }));
    expect(await screen.findByRole("button", { name: /generating/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /generate/i })).not.toBeDisabled();
    });
  });
});
