// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Formats research evidence into a citation list. */

import type { ResearchEvidence } from "./researchRunner";

export interface Citation {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

export function buildCitations(evidence: ResearchEvidence): Citation[] {
  const citations: Citation[] = [];
  let idx = 1;
  for (const r of evidence.searchResults) {
    if (!r.url) continue;
    citations.push({
      index: idx++,
      url: r.url,
      title: r.title,
      snippet: r.snippet,
    });
  }
  for (const s of evidence.scrapes) {
    const url = s.finalUrl || s.url;
    if (!url) continue;
    citations.push({
      index: idx++,
      url,
      title: s.title,
      snippet: s.content?.slice(0, 280),
    });
  }
  return citations;
}

export function formatCitationsMarkdown(citations: Citation[]): string {
  if (!citations.length) return "No citations available.";
  return citations
    .map((c) => `${c.index}. [${c.title || "Source"}](${c.url})`)
    .join("\n");
}
