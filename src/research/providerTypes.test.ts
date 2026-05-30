import { describe, it, expect } from "vitest";
import type { ResearchProvider, ResearchProviderId } from "./providerTypes";

describe("providerTypes contract", () => {
  it("accepts a valid provider shape", () => {
    const p: ResearchProvider = {
      id: "venice" as ResearchProviderId,
      label: "Venice",
      supports: { search: true, scrape: true, socialDiscovery: false, documentParsing: true },
      async search() {
        return [];
      },
      async scrape() {
        return {
          provider: "venice" as ResearchProviderId,
          url: "https://example.com",
          fetchedAt: new Date().toISOString(),
        };
      },
    };
    expect(p.id).toBe("venice");
  });
});
