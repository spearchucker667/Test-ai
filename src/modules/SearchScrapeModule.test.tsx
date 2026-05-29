// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SearchScrapeModule } from "./SearchScrapeModule";
import { initialState } from "../state/appReducer";

vi.mock("../services/veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

import { veniceFetch } from "../services/veniceClient";

describe("SearchScrapeModule", () => {
  const dispatch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModule() {
    return render(<SearchScrapeModule state={initialState} dispatch={dispatch} />);
  }

  it("shows a clear message for invalid search response shape", async () => {
    vi.mocked(veniceFetch).mockResolvedValueOnce({ data: { nope: true } } as any);
    renderModule();

    await userEvent.type(screen.getByPlaceholderText(/latest model routing/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(screen.getByText(/unexpected search response from server/i)).toBeInTheDocument();
    });
  });

  it("blocks invalid scrape URL before API call", async () => {
    renderModule();
    await userEvent.type(screen.getByPlaceholderText("https://example.com"), "javascript:alert(1)");
    await userEvent.click(screen.getByRole("button", { name: /^scrape$/i }));

    expect(veniceFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid public http\(s\) url/i)).toBeInTheDocument();
  });

  it("clears stale scrape output before a failed retry", async () => {
    vi.mocked(veniceFetch)
      .mockResolvedValueOnce({ data: { markdown: "old text" } } as any)
      .mockRejectedValueOnce(new Error("Scrape failed"));
    renderModule();

    const urlInput = screen.getByPlaceholderText("https://example.com");
    const scrapeBtn = screen.getByRole("button", { name: /^scrape$/i });
    const output = screen.getByPlaceholderText(/scraped markdown\/text output/i) as HTMLTextAreaElement;

    await userEvent.type(urlInput, "https://example.com");
    await userEvent.click(scrapeBtn);
    await waitFor(() => expect(output.value).toBe("old text"));

    await userEvent.click(scrapeBtn);
    await waitFor(() => expect(output.value).toBe(""));
    await waitFor(() => expect(screen.getByText(/scrape failed/i)).toBeInTheDocument());
  });
});
