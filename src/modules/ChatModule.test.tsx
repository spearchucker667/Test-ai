// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ChatModule } from "./ChatModule";
import { initialState } from "../state/appReducer";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../services/veniceClient", () => ({
  veniceFetch: vi.fn(),
  veniceStreamChat: vi.fn(),
}));

vi.mock("../services/storageService", () => ({
  default: {
    saveItem: vi.fn().mockResolvedValue({ id: "saved", timestamp: 1 }),
    getItems: vi.fn().mockResolvedValue([]),
  },
}));

// ModelRefreshButton calls refreshModels internally; stub it out.
vi.mock("../services/modelService", () => ({ refreshModels: vi.fn() }));

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

// jsdom does not implement scrollIntoView. The stub is set in beforeEach and
// removed in afterEach to prevent leaking into other test files.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { veniceFetch, veniceStreamChat } from "../services/veniceClient";

const mockDispatch = vi.fn();

function renderChat(stateOverride: object = {}) {
  const state = { ...initialState, ...stateOverride };
  return render(<ChatModule state={state} dispatch={mockDispatch} />);
}

const sendBtnSelector = { name: /^send$/i };
const promptSelector = { name: /^user prompt$/i };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore stub before each test since afterEach removes it.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    // Remove the scrollIntoView stub to prevent leaking into other test files.
    delete (window.HTMLElement.prototype as any).scrollIntoView;
  });

  it("renders the prompt textarea and send button", () => {
    renderChat();
    expect(screen.getByRole("textbox", promptSelector)).toBeInTheDocument();
    expect(screen.getByRole("button", sendBtnSelector)).toBeInTheDocument();
  });

  it("does not call API when the prompt is empty and send is clicked", async () => {
    renderChat();
    await userEvent.click(screen.getByRole("button", sendBtnSelector));
    expect(veniceFetch).not.toHaveBeenCalled();
    expect(veniceStreamChat).not.toHaveBeenCalled();
    // Validation message should appear.
    expect(screen.getByText(/please enter a prompt/i)).toBeInTheDocument();
  });

  it("calls veniceFetch for non-streaming send and appends assistant reply", async () => {
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { choices: [{ message: { content: "Hello from Venice!" } }] },
    } as any);

    renderChat({ usingFallbackModels: false });

    await userEvent.type(screen.getByRole("textbox", promptSelector), "What is the weather?");
    await userEvent.click(screen.getByRole("button", sendBtnSelector));

    await waitFor(() => {
      expect(veniceFetch).toHaveBeenCalledWith(
        "/chat/completions",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Hello from Venice!")).toBeInTheDocument();
    });
  });

  it("calls veniceStreamChat when streaming is enabled", async () => {
    vi.mocked(veniceStreamChat).mockResolvedValue(undefined);

    renderChat({ usingFallbackModels: false });

    // "Model & Settings" section is collapsed by default — expand it to access the checkboxes.
    await userEvent.click(screen.getByRole("button", { name: /model.*settings/i }));

    const streamCheckbox = screen.getByRole("checkbox", { name: /stream response/i });
    await userEvent.click(streamCheckbox);

    await userEvent.type(screen.getByRole("textbox", promptSelector), "Tell me a joke");
    await userEvent.click(screen.getByRole("button", sendBtnSelector));

    await waitFor(() => {
      expect(veniceStreamChat).toHaveBeenCalled();
    });
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  // BUG-002 regression guard: settings hydrated after mount must update Chat controls.
  it("syncs settings-backed controls when parent settings change", async () => {
    const initialSettings = {
      ...initialState.settings,
      defaultSystemPrompt: "Initial prompt",
      webSearch: "off",
      webScraping: false,
      webCitations: false,
      includeVeniceSystemPrompt: true,
    };
    const hydratedSettings = {
      ...initialSettings,
      defaultSystemPrompt: "Hydrated prompt",
      webSearch: "auto",
      webScraping: true,
      webCitations: true,
      includeVeniceSystemPrompt: false,
    };

    const { rerender } = render(
      <ChatModule
        state={{ ...initialState, settings: initialSettings }}
        dispatch={mockDispatch}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /model.*settings/i }));
    expect(screen.getByRole("textbox", { name: /^system prompt$/i })).toHaveValue("Initial prompt");

    rerender(
      <ChatModule
        state={{ ...initialState, settings: hydratedSettings }}
        dispatch={mockDispatch}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /^system prompt$/i })).toHaveValue("Hydrated prompt");
    });
    expect(screen.getByLabelText(/web search/i)).toHaveValue("auto");
    expect(screen.getByRole("checkbox", { name: /web scraping/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /citations/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /include venice system prompt/i })).not.toBeChecked();
  });

  it("shows an error message when veniceFetch rejects", async () => {
    vi.mocked(veniceFetch).mockRejectedValue(
      new Error("503 Service Unavailable")
    );

    renderChat({ usingFallbackModels: false });

    await userEvent.type(screen.getByRole("textbox", promptSelector), "Trigger an error");
    await userEvent.click(screen.getByRole("button", sendBtnSelector));

    await waitFor(() => {
      expect(screen.getByText(/503 service unavailable/i)).toBeInTheDocument();
    });
  });

  // BUG-002 regression guard: invalid response shape must not leak raw JSON.
  it("shows a user-readable error for invalid chat response shapes", async () => {
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { id: "invalid", error: "model not found" },
    } as any);

    renderChat({ usingFallbackModels: false });

    await userEvent.type(screen.getByRole("textbox", promptSelector), "Trigger invalid shape");
    await userEvent.click(screen.getByRole("button", sendBtnSelector));

    await waitFor(() => {
      expect(screen.getByText(/invalid chat response from server/i)).toBeInTheDocument();
    });
  });
});
