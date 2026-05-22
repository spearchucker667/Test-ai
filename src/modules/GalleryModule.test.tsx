// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { GalleryModule } from "./GalleryModule";
import { initialState } from "../state/appReducer";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../services/storageService", () => ({
  default: {
    deleteItem: vi.fn().mockResolvedValue(true),
    clearStore: vi.fn().mockResolvedValue(undefined),
    getItems: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../services/imageWorkflowService", () => ({
  upscaleGalleryImage: vi.fn(),
  downloadAllGallery: vi.fn(),
}));

vi.mock("../utils/download", () => ({
  downloadImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/image", () => ({
  galleryFilename: (item: any) => `${item.model}-${item.id}.png`,
}));

// ---------------------------------------------------------------------------
// Imports for assertions
// ---------------------------------------------------------------------------

import StorageService from "../services/storageService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockDispatch = vi.fn();

const sampleImage = {
  id: "img-1",
  image: "data:image/png;base64,AAAA",
  model: "test-model",
  prompt: "a cat",
  timestamp: Date.now(),
};

function renderGallery(stateOverride: object = {}) {
  const state = { ...initialState, gallery: [sampleImage], ...stateOverride };
  return render(<GalleryModule state={state} dispatch={mockDispatch} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe("GalleryModule confirm modal", () => {
  it("opens a confirm modal when clicking Delete on an image", async () => {
    const user = userEvent.setup();
    renderGallery();

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteBtn);

    // The confirm modal should be visible
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete this image\?/i)).toBeInTheDocument();
  });

  it("does NOT delete when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderGallery();

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteBtn);

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);

    expect(StorageService.deleteItem).not.toHaveBeenCalled();
  });

  it("calls StorageService.deleteItem and dispatches SET_GALLERY on confirm", async () => {
    const user = userEvent.setup();
    renderGallery();

    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteBtn);

    // Click the confirm/delete button inside the modal dialog
    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^delete$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(StorageService.deleteItem).toHaveBeenCalledWith("images", "img-1");
    });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_GALLERY" })
    );
  });

  it("opens confirm modal for Clear image gallery", async () => {
    const user = userEvent.setup();
    renderGallery();

    const clearBtn = screen.getByRole("button", { name: /clear image gallery/i });
    await user.click(clearBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete all gallery images\?/i)).toBeInTheDocument();
  });

  it("calls StorageService.clearStore on confirm for Clear gallery", async () => {
    const user = userEvent.setup();
    renderGallery();

    const clearBtn = screen.getByRole("button", { name: /clear image gallery/i });
    await user.click(clearBtn);

    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /^delete$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(StorageService.clearStore).toHaveBeenCalledWith("images");
    });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_GALLERY", items: [] })
    );
  });
});
