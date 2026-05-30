// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview AI-assisted research synthesis from gathered evidence.
 *
 * Calls the Venice /chat/completions endpoint with a strictly constrained
 * system prompt that requires evidence-only answers, citations, and
 * uncertainty marking. All traffic still passes the existing safety guard
 * inside veniceClient / veniceStreamChat.
 */

import { veniceFetch, veniceStreamChat } from "../../services/veniceClient";
import type { AppDispatch } from "../../types/app";
import type { ResearchEvidence } from "./researchRunner";

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a research assistant. Synthesize an answer to the user's question using ONLY the evidence provided.\n" +
  "Rules:\n" +
  "- Use only the supplied evidence. Do not use outside knowledge.\n" +
  "- Cite source URLs for every claim using [index] format.\n" +
  "- Mark uncertain claims with '(uncertain)'.\n" +
  "- Do not invent accounts, profiles, or private information.\n" +
  "- Do not include evasion or bypass instructions.\n" +
  "- If the evidence is insufficient, say so clearly.";

export interface SynthesisInput {
  question: string;
  evidence: ResearchEvidence;
  model: string;
  signal?: AbortSignal;
  dispatch?: AppDispatch;
  onDelta?: (delta: string) => void;
}

function buildSynthesisPrompt(question: string, evidence: ResearchEvidence): string {
  let prompt = `Question: ${question}\n\nEvidence:\n`;

  if (evidence.searchResults.length) {
    prompt += "\nSearch results:\n";
    evidence.searchResults.forEach((r, i) => {
      prompt += `[${i + 1}] ${r.title || "Untitled"} — ${r.url}\n`;
      if (r.snippet) prompt += `  Snippet: ${r.snippet.slice(0, 500)}\n`;
    });
  }

  if (evidence.scrapes.length) {
    prompt += "\nScraped pages:\n";
    evidence.scrapes.forEach((s, i) => {
      const url = s.finalUrl || s.url;
      prompt += `[S${i + 1}] ${s.title || url} — ${url}\n`;
      if (s.content) {
        const truncated = s.content.slice(0, 2000);
        prompt += `  Content: ${truncated}${s.content.length > 2000 ? "\n  …[truncated]" : ""}\n`;
      }
    });
  }

  if (!evidence.searchResults.length && !evidence.scrapes.length) {
    prompt += "No evidence was gathered.\n";
  }

  prompt += "\nPlease provide a concise, well-cited answer based solely on the evidence above.";
  return prompt;
}

/**
 * Synthesizes a research answer from evidence.
 *
 * If `onDelta` is provided, streams the response via veniceStreamChat.
 * Otherwise returns the full text via a single veniceFetch call.
 */
export async function synthesizeResearch(input: SynthesisInput): Promise<string> {
  const { question, evidence, model, signal, dispatch, onDelta } = input;
  const prompt = buildSynthesisPrompt(question, evidence);

  const payload = {
    model,
    messages: [
      { role: "system" as const, content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user" as const, content: prompt },
    ],
    temperature: 0.3,
  };

  if (onDelta) {
    let full = "";
    await veniceStreamChat(payload, {
      signal,
      dispatch,
      onDelta: (delta) => {
        full += delta;
        onDelta(delta);
      },
    });
    return full;
  }

  const { data } = await veniceFetch("/chat/completions", {
    method: "POST",
    body: payload,
    signal,
    dispatch,
  });

  const choices = (data as Record<string, unknown> | null)?.choices;
  const firstChoice = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content != null ? String(message.content) : "";
  return content;
}
