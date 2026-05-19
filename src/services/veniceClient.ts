import { extractImages } from "../utils/image";
import { DIAG_HEADER_NAMES } from "../constants/venice";

const LOCAL_PROXY_URL = "/api/venice";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new DOMException("Request aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });
}

function looksLikeUnixTimestamp(n: number) {
  return Number.isFinite(n) && n > 1000000000 && n < 9999999999;
}

function parseDiagnosticsHeaders(response: Response) {
  const headers: Record<string, string> = {};
  DIAG_HEADER_NAMES.forEach((name) => {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  });
  return headers;
}

export function summarizeDiagnostics({
  endpoint,
  method,
  status,
  ok,
  headers,
  error,
  startedAt,
  endedAt,
}: any) {
  return {
    endpoint,
    method,
    status: status || null,
    ok: !!ok,
    error: error || "",
    startedAt,
    endedAt,
    latencyMs:
      startedAt && endedAt
        ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
        : null,
    headers: headers || {},
  };
}

export function normalizeError(status: number | null, rawMessage: string) {
  const base = rawMessage || "Request failed";
  const map: Record<number, string> = {
    400: "400 request/schema/model error",
    401: "401 invalid or missing API key",
    402: "402 insufficient balance/payment required",
    403: "403 forbidden/key scope problem",
    415: "415 wrong content type",
    429: "429 rate limit",
    500: "500 Venice/server retryable error",
    503: "503 Venice/server retryable error",
  };
  return status && map[status] ? `${map[status]}: ${base}` : base;
}

function computeRateLimitWait(headers: any, attempt: number) {
  const raw = headers?.["x-ratelimit-reset-requests"];
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (looksLikeUnixTimestamp(n))
      return Math.max(0, Math.min(60000, n * 1000 - Date.now()));
    if (n >= 0 && n < 86400) return Math.min(60000, n * 1000);
  }
  return Math.min(2000 * Math.pow(2, attempt), 16000);
}

export async function veniceFetch(
  endpoint: string,
  {
    method = "GET",
    body = undefined as any,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as any,
    headers = {},
    isFormData = false,
    retry = true,
  } = {}
): Promise<{ data: any; response: Response; headers: any; diagnostics: any }> {
  const startedAt = nowIso();
  const url = `${LOCAL_PROXY_URL}${endpoint}`;
  const maxAttempts = retry ? 3 : 1;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");

    const requestHeaders: Record<string, string> = {
      ...headers,
    };
    if (!isFormData) requestHeaders["Content-Type"] = "application/json";

    let response: Response | null = null;
    let diagHeaders: any = {};
    const endedAt = nowIso();
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: isFormData
          ? body
          : body === undefined
          ? undefined
          : JSON.stringify(body),
        signal,
      });

      diagHeaders = parseDiagnosticsHeaders(response);

      let parsed: any;
      let text = "";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        parsed = await response.json().catch(async () => {
          text = await response.text().catch(() => "");
          return null;
        });
      } else if (
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      ) {
        const blob = await response.blob();
        parsed = {
          dataUrl: await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          }),
        };
      } else {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { text };
        }
      }

      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: "",
        startedAt,
        endedAt: nowIso(),
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const rawMessage =
          parsed?.error?.message ||
          parsed?.error ||
          parsed?.message ||
          parsed?.detail ||
          text ||
          response.statusText ||
          "Unknown Venice API error";
        const normalized = normalizeError(
          response.status,
          typeof rawMessage === "string"
            ? rawMessage
            : JSON.stringify(rawMessage)
        );
        const retryable = [429, 500, 503].includes(response.status);

        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : Math.min(1000 * Math.pow(2, attempt + 1), 8000),
            signal
          );
          continue;
        }

        const error: any = new Error(normalized);
        error.status = response.status;
        error.diagnostics = diag;
        throw error;
      }

      return { data: parsed, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;

      const isFetchFailure = err instanceof TypeError;
      const normalized = isFetchFailure
        ? "TypeError/fetch failure: likely CORS, network, browser sandbox, or blocked request. " +
          (err.message || "")
        : err.message || "Request failed";

      lastError = new Error(normalized);
      lastError.status = err.status || response?.status || null;

      dispatch?.({
        type: "SET_DIAGNOSTICS",
        diagnostics: summarizeDiagnostics({
          endpoint,
          method,
          status: lastError.status,
          ok: false,
          headers: diagHeaders,
          error: normalized,
          startedAt,
          endedAt: nowIso(),
        }),
      });

      if (
        (isFetchFailure || [429, 500, 503].includes(lastError.status)) &&
        attempt < maxAttempts - 1
      ) {
        await sleep(Math.min(1200 * Math.pow(2, attempt + 1), 9000), signal);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Request failed");
}

export async function veniceStreamChat(
  payload: any,
  {
    signal,
    dispatch,
    onDelta,
  }: { signal?: AbortSignal; dispatch?: any; onDelta: (delta: string) => void }
) {
  const startedAt = nowIso();
  const response = await fetch(`${LOCAL_PROXY_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  const headers = parseDiagnosticsHeaders(response);
  dispatch?.({
    type: "SET_DIAGNOSTICS",
    diagnostics: summarizeDiagnostics({
      endpoint: "/chat/completions",
      method: "POST",
      status: response.status,
      ok: response.ok,
      headers,
      error: "",
      startedAt,
      endedAt: nowIso(),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      normalizeError(response.status, text || response.statusText)
    );
  }

  if (!response.body)
    throw new Error("Streaming is unavailable in this browser sandbox.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.replace(/^data:\s*/, "");
      if (data === "[DONE]") return;

      try {
        const json = JSON.parse(data);
        const delta =
          json?.choices?.[0]?.delta?.content ||
          json?.choices?.[0]?.message?.content ||
          "";
        if (delta) onDelta(delta);
      } catch {}
    }
  }
}
