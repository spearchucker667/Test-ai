import React, { useState, useRef, useEffect } from "react";
import { veniceFetch } from "../services/veniceClient";
import { Field } from "../components/Field";
import { StatusBlock } from "../components/StatusBlock";
import { Chip } from "../components/Chip";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { copyText } from "../utils/download";
import { isValidSearchResponse } from "../utils/veniceValidation";
import { MAX_RAW_UPLOAD_BYTES } from "../services/veniceClient";
import { ModuleProps } from "../types/app";

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

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function runSearch() {
    if (!query.trim()) return;
    setError("");
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

  return (
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/50 bg-bg/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Search / scrape helper</h2>
            <div className="text-sm text-text-secondary mt-1">
              Experimental /augment/search, /augment/scrape, and browser FormData text-parser.
            </div>
          </div>
          <DiagPreview diagnostics={state.diagnostics} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <StatusBlock error={error} />

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
                      src="/assets/branding/venice-keys-red.svg"
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
      </div>
    </section>
  );
}
