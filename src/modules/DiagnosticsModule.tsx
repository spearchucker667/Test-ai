import React, { useEffect, useState } from "react";
import StorageService from "../services/storageService";
import { summarizeDiagnostics } from "../services/veniceClient";
import { Chip } from "../components/Chip";
import { copyText } from "../utils/download";
import { isElectron, desktopApp } from "../services/desktopBridge";
import { redactSecrets } from "../services/redaction";
import type { VeniceForgeDiagnostics } from "../types/desktop";

function nowIso() {
  return new Date().toISOString();
}

interface DiagnosticsModuleProps {
  state: any;
  dispatch: any;
  apiKeyConfigured: boolean | null;
}

export function DiagnosticsModule({ state, dispatch, apiKeyConfigured }: DiagnosticsModuleProps) {
  const d = state.diagnostics;
  const rows = d?.headers ? Object.entries(d.headers) : [];

  const [desktopDiagnostics, setDesktopDiagnostics] = useState<VeniceForgeDiagnostics | null>(null);

  useEffect(() => {
    if (!isElectron()) return;
    desktopApp.getDiagnostics().then(setDesktopDiagnostics).catch(() => {});
  }, []);

  async function copyDiagnostics() {
    const payload = redactSecrets({
      system: desktopDiagnostics || (await desktopApp.getDiagnostics()),
      latest: d || null,
      log: state.diagnosticsLog || [],
    });
    await copyText(JSON.stringify(payload, null, 2));
  }

  async function openLogs() {
    await desktopApp.openLogsFolder();
  }

  async function clearDiagnostics() {
    await StorageService.clearStore("diagnostics").catch(() => {});
    dispatch({
      type: "SET_DIAGNOSTICS",
      diagnostics: summarizeDiagnostics({
        endpoint: "local",
        method: "CLEAR",
        status: null,
        ok: true,
        headers: {},
        error: "Diagnostics display reset marker.",
        startedAt: nowIso(),
        endedAt: nowIso(),
      }),
    });
  }

  return (
    <section className="flex flex-col h-full bg-zinc-950">
      <div className="flex-none p-6 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-white">Diagnostics</h2>
            <div className="text-sm text-zinc-400 mt-1">
              Latest request, normalized headers, rate limits, balance, and error
              mapping.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn"
              onClick={copyDiagnostics}
            >
              Copy diagnostics
            </button>
            {isElectron() && (
              <button className="btn" onClick={openLogs}>
                Open logs folder
              </button>
            )}
            <button className="btn danger" onClick={clearDiagnostics}>
              Reset display
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Desktop system info */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <h3 className="text-lg font-medium text-white">System</h3>
            <Chip tone={isElectron() ? "ok" : undefined}>
              {isElectron() ? "Desktop" : "Web / Browser"}
            </Chip>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-black/40 border border-white/5 p-4">
              <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Mode</div>
              <div className="font-mono text-sm text-zinc-200 break-words">{isElectron() ? "Electron desktop" : "Browser / web server"}</div>
            </div>
            <div className="rounded-xl bg-black/40 border border-white/5 p-4">
              <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">App version</div>
              <div className="font-mono text-sm text-zinc-200 break-words">{desktopDiagnostics?.appVersion ?? (isElectron() ? "…" : "web")}</div>
            </div>
            <div className="rounded-xl bg-black/40 border border-white/5 p-4">
              <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">API key</div>
              <div className="font-mono text-sm text-zinc-200 break-words">
                {isElectron()
                  ? apiKeyConfigured === true ? "Configured ✓" : apiKeyConfigured === false ? "Not set ✗" : "…"
                  : "Server-side proxy"}
              </div>
            </div>
            <div className="rounded-xl bg-black/40 border border-white/5 p-4">
              <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Storage backend</div>
              <div className="font-mono text-sm text-zinc-200 break-words">IndexedDB (renderer)</div>
            </div>
            {isElectron() && (
              <>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Key storage mode</div>
                  <div className="font-mono text-sm text-zinc-200 break-words">
                    {desktopDiagnostics?.storageMode ?? "…"}
                  </div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Data path</div>
                  <div className="font-mono text-sm text-zinc-200 break-all">{desktopDiagnostics?.userDataPath ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Electron / Chrome</div>
                  <div className="font-mono text-sm text-zinc-200 break-words">
                    {desktopDiagnostics ? `${desktopDiagnostics.electronVersion} / ${desktopDiagnostics.chromeVersion}` : "…"}
                  </div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Node</div>
                  <div className="font-mono text-sm text-zinc-200 break-words">{desktopDiagnostics?.nodeVersion ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Transport</div>
                  <div className="font-mono text-sm text-zinc-200 break-words">{desktopDiagnostics?.transport ?? "direct-ipc"}</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Logs</div>
                  <div className="font-mono text-sm text-zinc-200 break-all">{desktopDiagnostics?.logsPath ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                  <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Last API error</div>
                  <div className="font-mono text-sm text-red-400 break-words">{desktopDiagnostics?.lastApiError || "none"}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {!d && (
          <div className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-8 text-center text-sm text-brand-200/80 shadow-[inset_0_0_40px_rgba(139,92,246,0.05)]">
            No Venice request has completed yet.
          </div>
        )}

        {d && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-black/40 border border-white/5 p-4 text-center">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Latest endpoint</div>
                <div className="font-mono text-sm text-brand-300">{d.endpoint}</div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4 text-center">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">HTTP status</div>
                <div className={`font-mono text-sm ${d.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {d.status || "network/local"}
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4 text-center">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Latency</div>
                <div className="font-mono text-sm text-zinc-300">{d.latencyMs ?? "n/a"} ms</div>
              </div>
            </div>

            {d.error && (
              <div className={`rounded-xl border p-4 text-sm ${d.ok ? 'border-brand-500/20 bg-brand-500/10 text-brand-200' : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>
                {d.error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Latest request ID / CF-RAY</div>
                <div className="font-mono text-sm text-zinc-300 break-all">
                  {d.headers?.["CF-RAY"] || "not present"}
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Model</div>
                <div className="font-mono text-sm text-zinc-300 break-words">
                  {d.model ||
                    d.headers?.["x-venice-model-id"] ||
                    d.headers?.["x-venice-model-name"] ||
                    "not present"}
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Rate-limit requests</div>
                <div className="font-mono text-sm text-zinc-300">
                  <span className="text-brand-300">{d.headers?.["x-ratelimit-remaining-requests"] || "?"}</span> /{" "}
                  {d.headers?.["x-ratelimit-limit-requests"] || "?"}
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Token counters</div>
                <div className="font-mono text-sm text-zinc-300">
                  <span className="text-brand-300">{d.headers?.["x-ratelimit-remaining-tokens"] || "?"}</span> /{" "}
                  {d.headers?.["x-ratelimit-limit-tokens"] || "?"}
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Balance headers</div>
                <div className="font-mono text-sm text-zinc-300">
                  USD <span className="text-emerald-400">{d.headers?.["x-venice-balance-usd"] || "?"}</span> · DIEM{" "}
                  <span className="text-emerald-400">{d.headers?.["x-venice-balance-diem"] || "?"}</span>
                </div>
              </div>
              <div className="rounded-xl bg-black/40 border border-white/5 p-4">
                <div className="text-xs tracking-wide text-zinc-500 uppercase mb-1">Deprecation warning</div>
                <div className={`text-sm ${d.headers?.["x-venice-model-deprecation-warning"] ? 'text-amber-400' : 'text-zinc-500'}`}>
                  {d.headers?.["x-venice-model-deprecation-warning"] || "none"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <caption className="sr-only">Venice API response headers</caption>
                <thead className="bg-black/60 border-b border-white/5">
                  <tr>
                    <th className="px-4 py-3 font-medium text-zinc-400 uppercase tracking-wider text-xs">Header</th>
                    <th className="px-4 py-3 font-medium text-zinc-400 uppercase tracking-wider text-xs">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-black/20 divide-y divide-white/5">
                  {rows.map(([k, v]) => (
                    <tr key={k} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-brand-300">{k}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-300 whitespace-normal break-all">{String(v)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-zinc-500 bg-black/40">
                        No tracked Venice headers were present.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md mt-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <h3 className="text-lg font-medium text-white">Recent diagnostics log</h3>
                <Chip>{state.diagnosticsLog.length}</Chip>
              </div>
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
                {state.diagnosticsLog.map((entry: any) => (
                  <div className="rounded-xl bg-black/40 border border-white/5 p-4" key={entry.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Chip tone={entry.ok ? "ok" : "danger"}>
                        {entry.status || "network"} {entry.ok ? "OK" : "error"}
                      </Chip>
                      <span className="font-mono text-sm text-zinc-300">
                        <span className="text-brand-400">{entry.method}</span> {entry.endpoint}
                      </span>
                    </div>
                    {entry.error && (
                      <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{entry.error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
