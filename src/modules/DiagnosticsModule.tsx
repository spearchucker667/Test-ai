import React from "react";
import StorageService from "../services/storageService";
import { summarizeDiagnostics } from "../services/veniceClient";
import { Chip } from "../components/Chip";
import { copyText } from "../utils/download";

function nowIso() {
  return new Date().toISOString();
}

export function DiagnosticsModule({ state, dispatch }: { state: any; dispatch: any }) {
  const d = state.diagnostics;
  const rows = d?.headers ? Object.entries(d.headers) : [];

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
            onClick={() => copyText(JSON.stringify(d || {}, null, 2))}
            disabled={!d}
          >
            Copy diagnostics
          </button>
          <button className="btn danger" onClick={clearDiagnostics}>
            Reset display
          </button>
        </div>
      </div>

      <div className="body grid">
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
                  {d.headers?.["x-venice-model-id"] ||
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
                      <td className="mono">{String(v)}</td>
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
