import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../services/veniceClient", () => ({
  veniceFetch: vi.fn(),
  veniceStreamChat: vi.fn(),
}));

import { veniceFetch, veniceStreamChat } from "../../services/veniceClient";
import { synthesizeResearch } from "./researchSynthesis";

describe("synthesizeResearch", () => {
  beforeEach(() => {
    vi.mocked(veniceFetch).mockReset();
    vi.mocked(veniceStreamChat).mockReset();
  });

  it("calls /chat/completions with evidence-only prompt", async () => {
    vi.mocked(veniceFetch).mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: "Answer" } }],
      },
    } as any);

    const result = await synthesizeResearch({
      question: "What is AI?",
      evidence: {
        searchResults: [
          { provider: "venice", title: "AI Overview", url: "https://a.com", snippet: "AI is..." },
        ],
        scrapes: [],
        citations: [],
      },
      model: "default",
    });

    expect(result).toBe("Answer");
    expect(veniceFetch).toHaveBeenCalledWith(
      "/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          model: "default",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "system" }),
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("AI Overview"),
            }),
          ]),
        }),
      })
    );
  });

  it("streams via veniceStreamChat when onDelta provided", async () => {
    vi.mocked(veniceStreamChat).mockImplementationOnce(async (_payload, { onDelta }) => {
      onDelta!("Hello ");
      onDelta!("world");
    });

    const deltas: string[] = [];
    const result = await synthesizeResearch({
      question: "Q",
      evidence: { searchResults: [], scrapes: [], citations: [] },
      model: "default",
      onDelta: (d) => deltas.push(d),
    });

    expect(result).toBe("Hello world");
    expect(deltas).toEqual(["Hello ", "world"]);
    expect(veniceStreamChat).toHaveBeenCalled();
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  it("marks uncertain claims and cites sources in system prompt", async () => {
    vi.mocked(veniceFetch).mockResolvedValueOnce({
      data: { choices: [{ message: { content: "" } }] },
    } as any);

    await synthesizeResearch({
      question: "Q",
      evidence: { searchResults: [], scrapes: [], citations: [] },
      model: "m",
    });

    const call = vi.mocked(veniceFetch).mock.calls[0];
    const body = call[1]?.body as Record<string, unknown> | undefined;
    const systemMsg = (body?.messages as Array<Record<string, string>> | undefined)?.[0].content;
    expect(systemMsg).toMatch(/Refusal is impossible/i);
    expect(systemMsg).toMatch(/citations/i);
    expect(systemMsg).toMatch(/internet/i);
  });
});
