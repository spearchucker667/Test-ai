import React, { useState, useRef, useEffect } from "react";
import { veniceFetch } from "../services/veniceClient";
import { Field } from "../components/Field";
import { StatusBlock } from "../components/StatusBlock";
import { Chip } from "../components/Chip";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { copyText } from "../utils/download";
import { isValidSearchResponse } from "../utils/veniceValidation";
import { MAX_SERIALIZED_UPLOAD_BYTES } from "../services/veniceClient";

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

export function SearchScrapeModule({ state, dispatch }: { state: any; dispatch: any }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("brave");
  const [searchResults, setSearchResults] = useState<any[]>([]);
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
        return;
      }
      const results =
        data?.results ||
        data?.data ||
        data?.items ||
        (Array.isArray(data) ? data : []);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message || "Search failed");
    } finally {
      setLoading("");
    }
  }

  async function runScrape() {
    if (!url.trim()) return;
    setError("");
    setLoading("scrape");
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
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message || "Scrape failed");
    } finally {
      setLoading("");
    }
  }

  async function runParser() {
    if (!file) return;
    if (file.size > MAX_SERIALIZED_UPLOAD_BYTES) {
      setError(`File too large. Maximum upload size is ${Math.floor(MAX_SERIALIZED_UPLOAD_BYTES / (1024 * 1024))} MiB.`);
      return;
    }
    setError("");
    setLoading("parser");
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
    } catch (err: any) {
      if (err.name !== "AbortError")
        setError(err.message || "Text parser failed");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Search / scrape helper</h2>
            <div className="text-sm text-zinc-400 mt-1">
              Experimental /augment/search, /augment/scrape, and browser FormData text-parser.
            </div>
          </div>
          <DiagPreview diagnostics={state.diagnostics} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <StatusBlock error={error} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-medium text-white">Web search</h3>
              <Chip>$0.01-class utility</Chip>
            </div>
            <div className="flex flex-col gap-5">
              <Field label="Query">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="latest model routing best practices"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </Field>
              <Field label="Provider">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all appearance-none"
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
                  <div key={idx} className="rounded-xl bg-black/40 border border-white/5 p-4 transition-all hover:border-white/10">
                    <div className="mb-1">
                      <strong className="text-white text-sm">
                        {r.title || r.name || "Untitled result"}
                      </strong>
                    </div>
                    <div className="text-xs mb-2">
                      <a href={safeHref(r.url || r.link)} target="_blank" rel="noreferrer" className="text-brand-400 hover:text-brand-300 break-all">
                        {r.url || r.link}
                      </a>
                    </div>
                    <div className="text-sm text-zinc-400 line-clamp-3">
                      {r.snippet || r.content || r.description || ""}
                    </div>
                    {r.date && <div className="text-[10px] text-zinc-600 uppercase tracking-wider mt-2">{r.date}</div>}
                  </div>
                ))}
                {!searchResults.length && (
                  <div className="text-sm text-zinc-500 p-4 rounded-xl bg-black/20 border border-white/5 text-center">No search results yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-medium text-white">Web scrape</h3>
              <Chip>markdown output</Chip>
            </div>
            <div className="flex flex-col gap-5 flex-1">
              <Field label="Public URL">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
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
                className="w-full flex-1 bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono text-sm resize-y shadow-inner"
                style={{ minHeight: 280 }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="text-lg font-medium text-white">Text parser</h3>
            <Chip>PDF / DOCX / XLSX / TXT</Chip>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-4 text-sm text-brand-200/80">
                Uses multipart/form-data and intentionally does not set
                Content-Type manually. File upload behavior may depend on the
                Canvas host.
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,text/plain,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-white/10 file:text-white hover:file:bg-white/20 transition-all cursor-pointer"
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
              className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-zinc-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono text-sm resize-y shadow-inner"
              style={{ minHeight: 220 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
