import React, { useState, useRef, useEffect } from "react";
import { veniceFetch } from "../services/veniceClient";
import { Field } from "../components/Field";
import { StatusBlock } from "../components/StatusBlock";
import { Chip } from "../components/Chip";
import { DiagPreview } from "../components/DiagnosticsPreview";
import { copyText } from "../utils/download";

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
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Search / scrape helper</h2>
          <div className="small muted">
            Experimental /augment/search, /augment/scrape, and browser FormData text-parser.
          </div>
        </div>
        <DiagPreview diagnostics={state.diagnostics} />
      </div>

      <div className="body grid">
        <StatusBlock error={error} />

        <div className="grid two">
          <div className="panel pad">
            <div className="panel-header">
              <div className="panel-title">Web search</div>
              <Chip>$0.01-class utility</Chip>
            </div>
            <div className="grid">
              <Field label="Query">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="latest model routing best practices"
                />
              </Field>
              <Field label="Provider">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="brave">brave</option>
                  <option value="google">google</option>
                </select>
              </Field>
              <button
                className="btn primary"
                onClick={runSearch}
                disabled={loading === "search" || !query.trim()}
              >
                {loading === "search" ? "Searching…" : "Search"}
              </button>
              <div className="grid">
                {searchResults.map((r, idx) => (
                  <div key={idx} className="model-item">
                    <div>
                      <strong>
                        {r.title || r.name || "Untitled result"}
                      </strong>
                    </div>
                    <div className="small">
                      <a href={r.url || r.link} target="_blank" rel="noreferrer">
                        {r.url || r.link}
                      </a>
                    </div>
                    <div className="small muted">
                      {r.snippet || r.content || r.description || ""}
                    </div>
                    {r.date && <div className="tiny faint">{r.date}</div>}
                  </div>
                ))}
                {!searchResults.length && (
                  <div className="small muted">No search results yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="panel pad">
            <div className="panel-header">
              <div className="panel-title">Web scrape</div>
              <Chip>markdown output</Chip>
            </div>
            <div className="grid">
              <Field label="Public URL">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </Field>
              <div className="chip-row">
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
                style={{ minHeight: 280 }}
              />
            </div>
          </div>
        </div>

        <div className="panel pad">
          <div className="panel-header">
            <div className="panel-title">Text parser</div>
            <Chip>PDF / DOCX / XLSX / TXT</Chip>
          </div>
          <div className="grid two">
            <div className="grid">
              <div className="notice small">
                Uses multipart/form-data and intentionally does not set
                Content-Type manually. File upload behavior may depend on the
                Canvas host.
              </div>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,text/plain,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <button
                className="btn primary"
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
              style={{ minHeight: 220 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
