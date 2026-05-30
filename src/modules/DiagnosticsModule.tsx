import React, { useEffect, useState } from "react";
import StorageService from "../services/storageService";
import { summarizeDiagnostics } from "../services/veniceClient";
import { Chip } from "../components/Chip";
import { copyText } from "../utils/download";
import { isElectron, desktopApp } from "../services/desktopBridge";
import { redactSecrets } from "../services/redaction";
import { SHORT_UNOFFICIAL_NOTICE } from "../shared/legal";
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
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/50 bg-bg/50 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Diagnostics</h2>
            <div className="text-sm text-text-secondary mt-1">
              Latest request, normalized headers, rate limits, balance, and error
              mapping.
            </div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-warning">
              {SHORT_UNOFFICIAL_NOTICE}
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
        <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
            <h3 className="text-lg font-medium text-text-primary">System</h3>
            <Chip tone={isElectron() ? "ok" : undefined}>
              {isElectron() ? "Desktop" : "Web / Browser"}
            </Chip>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
              <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Mode</div>
              <div className="font-mono text-sm text-text-primary break-words">{isElectron() ? "Electron desktop" : "Browser / web server"}</div>
            </div>
            <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
              <div className="text-xs tracking-wide text-text-muted uppercase mb-1">App version</div>
              <div className="font-mono text-sm text-text-primary break-words">{desktopDiagnostics?.appVersion ?? (isElectron() ? "…" : "web")}</div>
            </div>
            <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
              <div className="text-xs tracking-wide text-text-muted uppercase mb-1">API key</div>
              <div className="font-mono text-sm text-text-primary break-words">
                {isElectron()
                  ? apiKeyConfigured === true ? "Configured ✓" : apiKeyConfigured === false ? "Not set ✗" : "…"
                  : "Server-side proxy"}
              </div>
            </div>
            <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
              <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Storage backend</div>
              <div className="font-mono text-sm text-text-primary break-words">IndexedDB (renderer)</div>
            </div>
            {isElectron() && (
              <>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Key storage mode</div>
                  <div className="font-mono text-sm text-text-primary break-words">
                    {desktopDiagnostics?.storageMode ?? "…"}
                  </div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Data path</div>
                  <div className="font-mono text-sm text-text-primary break-all">{desktopDiagnostics?.userDataPath ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Electron / Chrome</div>
                  <div className="font-mono text-sm text-text-primary break-words">
                    {desktopDiagnostics ? `${desktopDiagnostics.electronVersion} / ${desktopDiagnostics.chromeVersion}` : "…"}
                  </div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Node</div>
                  <div className="font-mono text-sm text-text-primary break-words">{desktopDiagnostics?.nodeVersion ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Transport</div>
                  <div className="font-mono text-sm text-text-primary break-words">{desktopDiagnostics?.transport ?? "direct-ipc"}</div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Logs</div>
                  <div className="font-mono text-sm text-text-primary break-all">{desktopDiagnostics?.logsPath ?? "…"}</div>
                </div>
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Last API error</div>
                  <div className="font-mono text-sm text-danger break-words">{desktopDiagnostics?.lastApiError || "none"}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {!d && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-12 text-center shadow-[inset_0_0_40px_var(--glow)]">
            <img
              src="./assets/branding/venice-keys-red.svg"
              alt=""
              className="h-10 w-10 opacity-20"
              aria-hidden="true"
            />
            <div className="text-sm text-accent/80">
              No Venice request has completed yet.
            </div>
          </div>
        )}

        {d && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4 text-center">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Latest endpoint</div>
                <div className="font-mono text-sm text-accent">{d.endpoint}</div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4 text-center">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">HTTP status</div>
                <div className={`font-mono text-sm ${d.ok ? 'text-success' : 'text-danger'}`}>
                  {d.status || "network/local"}
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4 text-center">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Latency</div>
                <div className="font-mono text-sm text-text-secondary">{d.latencyMs ?? "n/a"} ms</div>
              </div>
            </div>

            {d.error && (
              <div className={`rounded-xl border p-4 text-sm ${d.ok ? 'border-accent/20 bg-accent/10 text-accent' : 'border-danger/20 bg-danger/10 text-danger'}`}>
                {d.error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Latest request ID / CF-RAY</div>
                <div className="font-mono text-sm text-text-secondary break-all">
                  {d.headers?.["CF-RAY"] || "not present"}
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Model</div>
                <div className="font-mono text-sm text-text-secondary break-words">
                  {d.model ||
                    d.headers?.["x-venice-model-id"] ||
                    d.headers?.["x-venice-model-name"] ||
                    "not present"}
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Rate-limit requests</div>
                <div className="font-mono text-sm text-text-secondary">
                  <span className="text-accent">{d.headers?.["x-ratelimit-remaining-requests"] || "?"}</span> /{" "}
                  {d.headers?.["x-ratelimit-limit-requests"] || "?"}
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Token counters</div>
                <div className="font-mono text-sm text-text-secondary">
                  <span className="text-accent">{d.headers?.["x-ratelimit-remaining-tokens"] || "?"}</span> /{" "}
                  {d.headers?.["x-ratelimit-limit-tokens"] || "?"}
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Balance headers</div>
                <div className="font-mono text-sm text-text-secondary">
                  USD <span className="text-success">{d.headers?.["x-venice-balance-usd"] || "?"}</span> · DIEM{" "}
                  <span className="text-success">{d.headers?.["x-venice-balance-diem"] || "?"}</span>
                </div>
              </div>
              <div className="rounded-xl bg-surface/50 border border-border/50 p-4">
                <div className="text-xs tracking-wide text-text-muted uppercase mb-1">Deprecation warning</div>
                <div className={`text-sm ${d.headers?.["x-venice-model-deprecation-warning"] ? 'text-warning' : 'text-text-muted'}`}>
                  {d.headers?.["x-venice-model-deprecation-warning"] || "none"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 overflow-hidden">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <caption className="sr-only">Venice API response headers</caption>
                <thead className="bg-overlay/60 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-text-secondary uppercase tracking-wider text-xs">Header</th>
                    <th className="px-4 py-3 font-medium text-text-secondary uppercase tracking-wider text-xs">Value</th>
                  </tr>
                </thead>
                <tbody className="bg-surface/30 divide-y divide-white/5">
                  {rows.map(([k, v]) => (
                    <tr key={k} className="hover:bg-surface-elevated transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-accent">{k}</td>
                      <td className="px-4 py-3 font-mono text-xs text-text-secondary whitespace-normal break-all">{String(v)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-text-muted bg-surface/50">
                        No tracked Venice headers were present.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-border/50 bg-surface-elevated/40 p-6 backdrop-blur-md mt-8">
              <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
                <h3 className="text-lg font-medium text-text-primary">Recent diagnostics log</h3>
                <Chip>{state.diagnosticsLog.length}</Chip>
              </div>
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
                {state.diagnosticsLog.map((entry: any) => (
                  <div className="rounded-xl bg-surface/50 border border-border/50 p-4" key={entry.id}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Chip tone={entry.ok ? "ok" : "danger"}>
                        {entry.status || "network"} {entry.ok ? "OK" : "error"}
                      </Chip>
                      <span className="font-mono text-sm text-text-secondary">
                        <span className="text-accent">{entry.method}</span> {entry.endpoint}
                      </span>
                    </div>
                    {entry.error && (
                      <div className="mt-3 rounded border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{entry.error}</div>
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
