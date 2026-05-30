import { describe, it, expect, vi } from "vitest";
import { runSocialDiscovery, type SocialDiscoveryInput } from "./socialDiscovery";
import type { ResearchProvider } from "../providerTypes";

function makeMockProvider(results: Array<{ title: string; url: string; snippet?: string }>): ResearchProvider {
  return {
    id: "venice",
    label: "Mock",
    supports: { search: true, scrape: false, socialDiscovery: false, documentParsing: false },
    async search() {
      return results.map((r) => ({ provider: "venice" as const, ...r }));
    },
  };
}

const baseInput: SocialDiscoveryInput = {
  targetName: "Example Creator",
  allowedPlatforms: ["GitHub", "X/Twitter"],
  maxSearchDepth: 5,
  authorized: true,
};

describe("runSocialDiscovery", () => {
  it("requires authorization checkbox", async () => {
    const provider = makeMockProvider([]);
    const result = await runSocialDiscovery(
      { ...baseInput, authorized: false },
      provider
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/authorization required/i);
  });

  it("generates platform-specific queries", async () => {
    const provider = makeMockProvider([
      { title: "Example Creator", url: "https://github.com/ecreator", snippet: "Developer" },
    ]);
    const result = await runSocialDiscovery(baseInput, provider);

    expect(result.ok).toBe(true);
    expect(result.queriesUsed.length).toBeGreaterThan(0);
    expect(result.queriesUsed.some((q) => q.includes("site:github.com"))).toBe(true);
  });

  it("dedupes candidate URLs", async () => {
    const provider = makeMockProvider([
      { title: "A", url: "https://github.com/ecreator" },
      { title: "B", url: "https://github.com/ecreator" },
    ]);
    const result = await runSocialDiscovery(baseInput, provider);
    expect(result.candidates).toHaveLength(1);
  });

  it("scores high when handle + name match", async () => {
    const provider = makeMockProvider([
      {
        title: "Example Creator",
        url: "https://github.com/ecreator",
        snippet: "Example Creator — open-source dev",
      },
    ]);
    const result = await runSocialDiscovery(
      { ...baseInput, knownUsername: "ecreator" },
      provider
    );

    expect(result.candidates[0].confidence).toBe("high");
    expect(result.candidates[0].confidenceScore).toBeGreaterThan(0.7);
  });

  it("scores low for federated platforms", async () => {
    const provider = makeMockProvider([
      { title: "Example Creator", url: "https://mastodon.social/@ecreator" },
    ]);
    const result = await runSocialDiscovery(
      { ...baseInput, allowedPlatforms: ["Mastodon"] },
      provider
    );

    expect(result.candidates[0].confidence).toBe("low");
    expect(result.candidates[0].matchedSignals).toContain("federated platform");
  });

  it("does not include private-contact fields", async () => {
    const provider = makeMockProvider([
      { title: "Example Creator", url: "https://github.com/ecreator", snippet: "contact@example.com" },
    ]);
    const result = await runSocialDiscovery(baseInput, provider);
    const candidate = result.candidates[0];
    expect(candidate).not.toHaveProperty("email");
    expect(candidate).not.toHaveProperty("phone");
    expect(candidate).not.toHaveProperty("address");
  });

  it("returns error when provider lacks search", async () => {
    const provider: ResearchProvider = {
      id: "venice",
      label: "Mock",
      supports: { search: false, scrape: false, socialDiscovery: false, documentParsing: false },
    };
    const result = await runSocialDiscovery(baseInput, provider);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not support search/i);
  });
});
