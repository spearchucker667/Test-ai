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
    <section className="content-card">
      <div className="toolbar">
        <div>
          <h2>Diagnostics</h2>
          <div className="small muted">
            Latest request, normalized headers, rate limits, balance, and error
            mapping.
          </div>
        </div>
        <div className="chip-row">
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

      <div className="body grid">
        {/* Desktop system info */}
        <div className="panel pad">
          <div className="panel-header">
            <div className="panel-title">System</div>
            <Chip tone={isElectron() ? "ok" : undefined}>
              {isElectron() ? "Desktop" : "Web / Browser"}
            </Chip>
          </div>
          <div className="grid three">
            <div className="model-item">
              <div className="tiny muted">Mode</div>
              <div className="mono small">{isElectron() ? "Electron desktop" : "Browser / web server"}</div>
            </div>
            <div className="model-item">
              <div className="tiny muted">App version</div>
              <div className="mono small">{desktopDiagnostics?.appVersion ?? (isElectron() ? "…" : "web")}</div>
            </div>
            <div className="model-item">
              <div className="tiny muted">API key</div>
              <div className="mono small">
                {isElectron()
                  ? apiKeyConfigured === true ? "Configured ✓" : apiKeyConfigured === false ? "Not set ✗" : "…"
                  : "Server-side proxy"}
              </div>
            </div>
            <div className="model-item">
              <div className="tiny muted">Storage backend</div>
              <div className="mono small">IndexedDB (renderer)</div>
            </div>
            {isElectron() && (
              <>
                <div className="model-item">
                  <div className="tiny muted">Key storage mode</div>
                  <div className="mono small">
                    {desktopDiagnostics?.storageMode ?? "…"}
                  </div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Data path</div>
                  <div className="mono small" style={{ wordBreak: "break-all" }}>{desktopDiagnostics?.userDataPath ?? "…"}</div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Electron / Chrome</div>
                  <div className="mono small">
                    {desktopDiagnostics ? `${desktopDiagnostics.electronVersion} / ${desktopDiagnostics.chromeVersion}` : "…"}
                  </div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Node</div>
                  <div className="mono small">{desktopDiagnostics?.nodeVersion ?? "…"}</div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Transport</div>
                  <div className="mono small">{desktopDiagnostics?.transport ?? "direct-ipc"}</div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Logs</div>
                  <div className="mono small" style={{ wordBreak: "break-all" }}>{desktopDiagnostics?.logsPath ?? "…"}</div>
                </div>
                <div className="model-item">
                  <div className="tiny muted">Last API error</div>
                  <div className="mono small">{desktopDiagnostics?.lastApiError || "none"}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {!d && (
          <div className="notice small">
            No Venice request has completed yet.
          </div>
        )}

        {d && (
          <>
            <div className="grid three">
              <div className="model-item">
                <div className="tiny muted">Latest endpoint</div>
                <div className="mono small">{d.endpoint}</div>
              </div>
              <div className="model-item">
                <div className="tiny muted">HTTP status</div>
                <div className="mono small">
                  {d.status || "network/local"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Latency</div>
                <div className="mono small">{d.latencyMs ?? "n/a"} ms</div>
              </div>
            </div>

            {d.error && (
              <div className={d.ok ? "notice small" : "error"}>{d.error}</div>
            )}

            <div className="grid two">
              <div className="model-item">
                <div className="tiny muted">Latest request ID / CF-RAY</div>
                <div className="mono small">
                  {d.headers?.["CF-RAY"] || "not present"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Model</div>
                <div className="mono small">
                  {d.model ||
                    d.headers?.["x-venice-model-id"] ||
                    d.headers?.["x-venice-model-name"] ||
                    "not present"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Rate-limit requests</div>
                <div className="mono small">
                  {d.headers?.["x-ratelimit-remaining-requests"] || "?"} /{" "}
                  {d.headers?.["x-ratelimit-limit-requests"] || "?"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Token counters</div>
                <div className="mono small">
                  {d.headers?.["x-ratelimit-remaining-tokens"] || "?"} /{" "}
                  {d.headers?.["x-ratelimit-limit-tokens"] || "?"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Balance headers</div>
                <div className="mono small">
                  USD {d.headers?.["x-venice-balance-usd"] || "?"} · DIEM{" "}
                  {d.headers?.["x-venice-balance-diem"] || "?"}
                </div>
              </div>
              <div className="model-item">
                <div className="tiny muted">Deprecation warning</div>
                <div className="small">
                  {d.headers?.["x-venice-model-deprecation-warning"] || "none"}
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <caption className="sr-only">Venice API response headers</caption>
                <thead>
                  <tr>
                    <th>Header</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="mono">{k}</td>
                      <td className="mono" style={{ wordBreak: "break-all" }}>{String(v)}</td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={2} className="muted">
                        No tracked Venice headers were present.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel pad">
              <div className="panel-header">
                <div className="panel-title">Recent diagnostics log</div>
                <Chip>{state.diagnosticsLog.length}</Chip>
              </div>
              <div className="model-list">
                {state.diagnosticsLog.map((entry: any) => (
                  <div className="model-item" key={entry.id}>
                    <div className="chip-row">
                      <Chip tone={entry.ok ? "ok" : "danger"}>
                        {entry.status || "network"} {entry.ok ? "OK" : "error"}
                      </Chip>
                      <span className="mono small">
                        {entry.method} {entry.endpoint}
                      </span>
                    </div>
                    {entry.error && (
                      <div className="tiny muted">{entry.error}</div>
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
