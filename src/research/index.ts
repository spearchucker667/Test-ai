// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Barrel export for the Venice Forge research subsystem. */

export type {
  ResearchProviderId,
  SearchInput,
  ScrapeInput,
  SearchResult,
  ScrapeResult,
  ResearchProvider,
} from "./providerTypes";

export { veniceResearchProvider } from "./providers/veniceResearchProvider";

export {
  createJinaProvider,
  type JinaProviderConfig,
} from "./providers/jinaResearchProvider";

export {
  createGenericHttpProvider,
  type GenericHttpConfig,
  isSafeUrl,
} from "./providers/genericHttpScrapeProvider";

export type {
  ResearchBudget,
  ResearchJobInput,
  ResearchEvidence,
  ResearchJobResult,
} from "./agent/researchRunner";

export { runResearchJob } from "./agent/researchRunner";

export {
  createEvidenceStore,
  type EvidenceStore,
  type EvidenceRecord,
} from "./agent/evidenceStore";
