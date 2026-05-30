import React, { useState, useRef, useEffect } from "react";
import { veniceFetch } from "../services/veniceClient";
import { assessChildExploitationSafety } from "../shared/safety";
import { Field } from "../components/Field";
import { StatusBlock } from "../components/StatusBlock";
import { Chip } from "../components/Chip";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { copyText } from "../utils/download";
import { isValidSearchResponse } from "../utils/veniceValidation";
import { MAX_RAW_UPLOAD_BYTES } from "../services/veniceClient";
import { ModuleProps } from "../types/app";
import { veniceResearchProvider } from "../research/providers/veniceResearchProvider";
import { runResearchJob, type ResearchBudget } from "../research/agent/researchRunner";
import { synthesizeResearch } from "../research/agent/researchSynthesis";
import { runSocialDiscovery, type SocialProfileCandidate } from "../research/agent/socialDiscovery";

interface SearchResultItem {
  title?: string;
  name?: string;
  url?: string;
  link?: string;
  snippet?: string;
  content?: string;
  description?: string;
  date?: string;
}

type SubTab = "search" | "ai-research" | "profile-discovery";

const ALL_PLATFORMS = [
  "GitHub",
  "LinkedIn",
  "X/Twitter",
  "Instagram",
  "TikTok",
  "YouTube",
  "Reddit",
  "Facebook",
  "Bluesky",
  "Threads",
  "Mastodon",
  "personal website",
];

/** Allow only http/https URLs; return "#" for anything else (javascript:, data:, etc.). */
export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

export function SearchScrapeModule({ state, dispatch }: ModuleProps) {
  const [subTab, setSubTab] = useState<SubTab>("search");

  // --- Search / Scrape state ---
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("brave");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [url, setUrl] = useState("");
  const [scrapeOutput, setScrapeOutput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parserOutput, setParserOutput] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // --- AI Research state ---
  const [researchQuestion, setResearchQuestion] = useState("");
  const [researchOutput, setResearchOutput] = useState("");
  const [researchCitations, setResearchCitations] = useState("");

  // --- Public Profile Discovery state ---
  const [targetName, setTargetName] = useState("");
  const [knownUsername, setKnownUsername] = useState("");
  const [knownWebsite, setKnownWebsite] = useState("");
  const [knownOrg, setKnownOrg] = useState("");
  const [knownLocation, setKnownLocation] = useState("");
  const [allowedPlatforms, setAllowedPlatforms] = useState<string[]>(["GitHub", "LinkedIn", "X/Twitter"]);
  const [maxDepth, setMaxDepth] = useState(5);
  const [authorized, setAuthorized] = useState(false);
  const [profileCandidates, setProfileCandidates] = useState<SocialProfileCandidate[]>([]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function runSearch() {
    if (!query.trim()) return;
    setError("");
    const guardDecision = assessChildExploitationSafety({ text: query.trim(), endpoint: "/augment/search", method: "POST", source: "research" });
    if (!guardDecision.allow || guardDecision.action === "block") {
      setError(guardDecision.userMessage);
      return;
    }
    setLoading("search");
    setSearchResults([]);
    abortRef.current = new AbortController();
    try {
      const { data } = await veniceFetch("/augment/search", {
        method: "POST",
        body: { query: query.trim(), provider },
        signal: abortRef.current.signal,
        dispatch,
      });
      if (!isValidSearchResponse(data)) {
        setSearchResults([]);
        setError("Unexpected search response from server.");
        return;
      }
      const results =
        data?.results ||
        data?.data ||
        data?.items ||
        (Array.isArray(data) ? data : []);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Search failed");
    } finally {
      setLoading("");
    }
  }

  async function runScrape() {
    if (!url.trim()) return;
    if (safeHref(url.trim()) === "#") {
      setError("Enter a valid public http(s) URL.");
      return;
    }
    setError("");
    setLoading("scrape");
    setScrapeOutput("");
    abortRef.current = new AbortController();
    try {
      const { data } = await veniceFetch("/augment/scrape", {
        method: "POST",
        body: { url: url.trim() },
        signal: abortRef.current.signal,
        dispatch,
      });
      setScrapeOutput(
        data?.markdown ||
          data?.content ||
          data?.text ||
          JSON.stringify(data, null, 2)
      );
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Scrape failed");
    } finally {
      setLoading("");
    }
  }

  async function runParser() {
    if (!file) return;
    if (file.size > MAX_RAW_UPLOAD_BYTES) {
      setError(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / (1024 * 1024))} MiB.`);
      return;
    }
    setError("");
    setLoading("parser");
    setParserOutput("");
    abortRef.current = new AbortController();
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("response_format", "json");
      const { data } = await veniceFetch("/augment/text-parser", {
        method: "POST",
        body: form,
        signal: abortRef.current.signal,
        dispatch,
        isFormData: true,
      });
      setParserOutput(data?.text || JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError")
        setError(error.message || "Text parser failed");
    } finally {
      setLoading("");
    }
  }

  async function runAiResearch() {
    if (!researchQuestion.trim()) return;
    setError("");
    setLoading("ai-research");
    setResearchOutput("");
    setResearchCitations("");
    abortRef.current = new AbortController();

    const budget: ResearchBudget = {
      maxQueries: 4,
      maxResultsPerQuery: 5,
      maxPages: 3,
      maxCharsPerPage: 4000,
      perRequestTimeoutMs: 15000,
      totalJobTimeoutMs: 120000,
    };

    try {
      const job = await runResearchJob({
        question: researchQuestion.trim(),
        provider: veniceResearchProvider,
        budget,
        signal: abortRef.current.signal,
      });

      if (!job.ok) {
        setError(job.error || "Research job failed.");
        return;
      }

      setResearchCitations(job.evidence.citations.join("\n"));

      const model = state.selectedChatModel || "default";
      let full = "";
      await synthesizeResearch({
        question: researchQuestion.trim(),
        evidence: job.evidence,
        model,
        signal: abortRef.current.signal,
        dispatch,
        onDelta: (delta) => {
          full += delta;
          setResearchOutput(full);
        },
      });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "AI research failed");
    } finally {
      setLoading("");
    }
  }

  async function runProfileDiscovery() {
    if (!targetName.trim() || !authorized) return;
    setError("");
    setLoading("profile-discovery");
    setProfileCandidates([]);
    abortRef.current = new AbortController();

    try {
      const result = await runSocialDiscovery(
        {
          targetName: targetName.trim(),
          knownUsername: knownUsername.trim() || undefined,
          knownWebsite: knownWebsite.trim() || undefined,
          knownOrganization: knownOrg.trim() || undefined,
          knownLocation: knownLocation.trim() || undefined,
          allowedPlatforms,
          maxSearchDepth: maxDepth,
          authorized: true,
        },
        veniceResearchProvider
      );

      if (!result.ok) {
        setError(result.error || "Profile discovery failed.");
        return;
      }

      setProfileCandidates(result.candidates);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") setError(error.message || "Profile discovery failed");
    } finally {
      setLoading("");
    }
  }

  function togglePlatform(platform: string) {
    setAllowedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  const tabBtn = (id: SubTab, label: string) => (
    <button
      key={id}
      onClick={() => setSubTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        subTab === id
          ? "bg-accent/20 text-accent border border-accent/30"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/50 bg-bg/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Research</h2>
            <div className="text-sm text-text-secondary mt-1">
              Search, scrape, AI research, and public profile discovery.
            </div>
          </div>
          <DiagPreview diagnostics={state.diagnostics} />
        </div>
        <div className="flex gap-2 mt-4">
          {tabBtn("search", "Search / Scrape")}
          {tabBtn("ai-research", "AI Research")}
          {tabBtn("profile-discovery", "Public Profile Discovery")}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <StatusBlock error={error} />

        {subTab === "search" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <h3 className="text-lg font-medium text-text-primary">Web search</h3>
                  <Chip>$0.01-class utility</Chip>
                </div>
                <div className="flex flex-col gap-5">
                  <Field label="Query">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="latest model routing best practices"
                      className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </Field>
                  <Field label="Provider">
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                    >
                      <option value="brave">brave</option>
                      <option value="google">google</option>
                    </select>
                  </Field>
                  <button
                    className="btn primary self-start"
                    onClick={runSearch}
                    disabled={loading === "search" || !query.trim()}
                  >
                    {loading === "search" ? "Searching…" : "Search"}
                  </button>
                  
                  <div className="flex flex-col gap-4 mt-2">
                    {searchResults.map((r, idx) => (
                      <div key={idx} className="rounded-xl bg-surface/50 border border-border/50 p-4 transition-all hover:border-border">
                        <div className="mb-1">
                          <strong className="text-text-primary text-sm">
                            {r.title || r.name || "Untitled result"}
                          </strong>
                        </div>
                        <div className="text-xs mb-2">
                          <a href={safeHref(r.url || r.link)} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-hover break-all">
                            {r.url || r.link}
                          </a>
                        </div>
                        <div className="text-sm text-text-secondary line-clamp-3">
                          {r.snippet || r.content || r.description || ""}
                        </div>
                        {r.date && <div className="text-[10px] text-text-muted uppercase tracking-wider mt-2">{r.date}</div>}
                      </div>
                    ))}
                    {!searchResults.length && (
                      <div className="flex flex-col items-center justify-center gap-3 text-sm text-text-muted p-6 rounded-xl bg-surface/30 border border-border/50 text-center">
                        <img
                          src="./assets/branding/venice-keys-red.svg"
                          alt=""
                          className="h-8 w-8 opacity-15"
                          aria-hidden="true"
                        />
                        <div>No search results yet.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-6">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <h3 className="text-lg font-medium text-text-primary">Web scrape</h3>
                  <Chip>markdown output</Chip>
                </div>
                <div className="flex flex-col gap-5 flex-1">
                  <Field label="Public URL">
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="btn primary"
                      onClick={runScrape}
                      disabled={loading === "scrape" || !url.trim()}
                    >
                      {loading === "scrape" ? "Scraping…" : "Scrape"}
                    </button>
                    <button
                      className="btn"
                      onClick={() => copyText(scrapeOutput)}
                      disabled={!scrapeOutput}
                    >
                      Copy output
                    </button>
                  </div>
                  <textarea
                    value={scrapeOutput}
                    onChange={(e) => setScrapeOutput(e.target.value)}
                    placeholder="Scraped markdown/text output"
                    className="w-full flex-1 bg-surface/50 border border-border/50 rounded-xl px-5 py-4 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono text-sm resize-y shadow-inner"
                    style={{ minHeight: 280 }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-lg font-medium text-text-primary">Text parser</h3>
                <Chip>PDF / DOCX / XLSX / TXT</Chip>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-5">
                  <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-accent/80">
                    Uses multipart/form-data and intentionally does not set
                    Content-Type manually. File upload behavior may depend on the
                    Canvas host.
                  </div>
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.txt,text/plain,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-surface-elevated file:text-text-primary hover:file:bg-surface transition-all cursor-pointer"
                  />
                  <button
                    className="btn primary self-start"
                    onClick={runParser}
                    disabled={loading === "parser" || !file}
                  >
                    {loading === "parser" ? "Parsing…" : "Parse document"}
                  </button>
                </div>
                <textarea
                  value={parserOutput}
                  onChange={(e) => setParserOutput(e.target.value)}
                  placeholder="Extracted text"
                  className="w-full bg-surface/50 border border-border/50 rounded-xl px-5 py-4 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono text-sm resize-y shadow-inner"
                  style={{ minHeight: 220 }}
                />
              </div>
            </div>
          </>
        )}

        {subTab === "ai-research" && (
          <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-border/50 pb-4">
              <h3 className="text-lg font-medium text-text-primary">AI Research</h3>
              <Chip>evidence-only synthesis</Chip>
            </div>
            <div className="flex flex-col gap-5">
              <Field label="Research question">
                <input
                  value={researchQuestion}
                  onChange={(e) => setResearchQuestion(e.target.value)}
                  placeholder="What are the latest trends in AI safety regulation?"
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn primary"
                  onClick={runAiResearch}
                  disabled={loading === "ai-research" || !researchQuestion.trim()}
                >
                  {loading === "ai-research" ? "Researching…" : "Run research"}
                </button>
                <button
                  className="btn"
                  onClick={() => copyText(researchOutput)}
                  disabled={!researchOutput}
                >
                  Copy answer
                </button>
                <button
                  className="btn"
                  onClick={() => copyText(researchCitations)}
                  disabled={!researchCitations}
                >
                  Copy citations
                </button>
              </div>
              <textarea
                value={researchOutput}
                onChange={(e) => setResearchOutput(e.target.value)}
                placeholder="Synthesized answer will appear here"
                className="w-full bg-surface/50 border border-border/50 rounded-xl px-5 py-4 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all font-mono text-sm resize-y shadow-inner"
                style={{ minHeight: 280 }}
              />
              {researchCitations && (
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-sm font-medium text-text-primary mb-2">Citations</div>
                  <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono">{researchCitations}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {subTab === "profile-discovery" && (
          <div className="space-y-8">
            <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border/50 pb-4">
                <h3 className="text-lg font-medium text-text-primary">Public Profile Discovery</h3>
                <Chip>public web only</Chip>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="Target name">
                  <input
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Example Brand"
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
                <Field label="Known username / handle">
                  <input
                    value={knownUsername}
                    onChange={(e) => setKnownUsername(e.target.value)}
                    placeholder="@example"
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
                <Field label="Known website / domain">
                  <input
                    value={knownWebsite}
                    onChange={(e) => setKnownWebsite(e.target.value)}
                    placeholder="example.com"
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
                <Field label="Known organization">
                  <input
                    value={knownOrg}
                    onChange={(e) => setKnownOrg(e.target.value)}
                    placeholder="Example Inc"
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
                <Field label="Known location (optional)">
                  <input
                    value={knownLocation}
                    onChange={(e) => setKnownLocation(e.target.value)}
                    placeholder="San Francisco"
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
                <Field label="Max search depth">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="w-full bg-surface/50 border border-border/50 rounded-lg px-4 py-2.5 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </Field>
              </div>

              <div>
                <div className="text-sm font-medium text-text-primary mb-2">Platforms</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_PLATFORMS.map((platform) => (
                    <label
                      key={platform}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-all ${
                        allowedPlatforms.includes(platform)
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border/50 text-text-secondary hover:border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-accent"
                        checked={allowedPlatforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-accent/20 bg-accent/5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-accent"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                />
                <span className="text-sm text-text-primary leading-relaxed">
                  I confirm this search is for myself, my organization/brand, a consenting person, a public figure, or another authorized public-interest use. Search will use public web results only and will not access private accounts, login-gated content, DMs, contact harvesting, or bypass protections.
                </span>
              </label>

              <button
                className="btn primary self-start"
                onClick={runProfileDiscovery}
                disabled={loading === "profile-discovery" || !targetName.trim() || !authorized}
              >
                {loading === "profile-discovery" ? "Discovering…" : "Discover public profiles"}
              </button>
            </div>

            {profileCandidates.length > 0 && (
              <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <h3 className="text-lg font-medium text-text-primary">Candidate profiles</h3>
                  <Chip>{profileCandidates.length} found</Chip>
                </div>
                <div className="text-xs text-text-muted">
                  Candidate profiles, not verified identity matches.
                </div>
                <div className="flex flex-col gap-4">
                  {profileCandidates.map((c, idx) => (
                    <div key={idx} className="rounded-xl bg-surface/50 border border-border/50 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-primary">{c.platform}</span>
                          <Chip tone={c.confidence === "high" ? "ok" : c.confidence === "medium" ? "warn" : "muted"}>{c.confidence}</Chip>
                        </div>
                        <span className="text-xs text-text-muted">Score: {c.confidenceScore}</span>
                      </div>
                      <div className="text-sm text-text-secondary mb-1">
                        {c.displayName || "Unknown name"}
                        {c.handle && <span className="text-text-muted ml-2">@{c.handle}</span>}
                      </div>
                      <a
                        href={safeHref(c.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-accent hover:text-accent-hover break-all"
                      >
                        {c.url}
                      </a>
                      {c.bioSnippet && (
                        <div className="text-xs text-text-secondary mt-2 line-clamp-2">{c.bioSnippet}</div>
                      )}
                      {c.matchedSignals.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {c.matchedSignals.map((s, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted border border-border/50">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
