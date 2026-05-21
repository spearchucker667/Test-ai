// Code Owner: fayeblade (@spearchucker667)
// Single entry point for all Venice API calls from the renderer.
import { extractImages } from "../utils/image";
import { DIAG_HEADER_NAMES } from "../constants/venice";
import { PROXY_BASE_PATH } from "../shared/apiConfig";
import { desktopVenice, isElectron } from "./desktopBridge";

// In-flight request deduplication (API-004)
const inFlight = new Map<string, Promise<any>>();

function dedupeKey(endpoint: string, method: string, body: unknown): string {
  const bodyHash = body === undefined ? "" : JSON.stringify(body);
  return `${method} ${endpoint} ${bodyHash}`;
}

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

function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 8000): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
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
    404: "404 model or resource not found",
    413: "413 payload too large",
    415: "415 wrong content type",
    429: "429 rate limit",
    500: "500 Venice/server retryable error",
    503: "503 Venice/server retryable error",
  };
  return status && map[status] ? `${map[status]}: ${base}` : base;
}

function readDesktopErrorBody(body: any): string {
  // Standard Venice error: { error: string } or { error: { message: string } }
  const top = body?.error?.message || body?.error || body?.message;
  if (top) return String(top);
  // Venice DetailedError (Zod): { details: { _errors?: string[], field?: { _errors: string[] } } }
  const details = body?.details;
  if (details && typeof details === "object") {
    if (Array.isArray(details._errors) && details._errors.length) return String(details._errors[0]);
    for (const key of Object.keys(details)) {
      if (key === "_errors") continue;
      const errs = details[key]?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(body?.detail || body?.text || "Unknown Venice API error");
}

function readWebErrorBody(parsed: any, text: string, statusText: string): string {
  const top = parsed?.error?.message || parsed?.error || parsed?.message;
  if (top) return String(top);
  const details = parsed?.details;
  if (details && typeof details === "object") {
    if (Array.isArray(details._errors) && details._errors.length) return String(details._errors[0]);
    for (const key of Object.keys(details)) {
      if (key === "_errors") continue;
      const errs = details[key]?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(parsed?.detail || text || statusText || "Unknown Venice API error");
}

interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

interface SerializedFormData {
  _isSerializedFormData: true;
  entries: SerializedFormDataEntry[];
}

async function serializeFormData(formData: FormData): Promise<SerializedFormData> {
  const entries: SerializedFormDataEntry[] = [];
  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      entries.push({
        name,
        value: btoa(binary),
        filename: value.name,
        type: value.type,
        _isFile: true,
      });
    } else {
      entries.push({ name, value: String(value) });
    }
  }
  return { _isSerializedFormData: true, entries };
}

async function veniceFetchDesktop(
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
): Promise<{ data: any; response: any; headers: any; diagnostics: any }> {
  // Serialize FormData before crossing the IPC boundary.
  let serializedBody = body;
  if (isFormData && body instanceof FormData) {
    serializedBody = await serializeFormData(body);
  }
  const maxAttempts = retry ? 3 : 1;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = nowIso();
    let diagHeaders: any = {};
    let response: any = null;
    try {
      if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      response = await desktopVenice.request(
        {
          endpoint,
          method: method as "GET" | "POST",
          body: serializedBody,
          headers,
        },
        signal
      );
      diagHeaders = response.headers || {};
      const errorMsg = response.ok ? "" : normalizeError(response.status, readDesktopErrorBody(response.body));
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: errorMsg,
        startedAt,
        endedAt: nowIso(),
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const retryable = [429, 500, 503].includes(response.status);
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : calculateBackoff(attempt + 1),
            signal
          );
          continue;
        }
        const error: any = new Error(errorMsg);
        error.status = response.status;
        error.diagnostics = diag; // marks as already dispatched
        throw error;
      }

      return { data: response.body, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      const normalized = err.message || "Desktop Venice transport failed.";
      lastError = new Error(normalized);
      lastError.status = err.status || response?.status || null;
      // Skip re-dispatch for HTTP errors already dispatched in the try block.
      if (!err.diagnostics) {
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
      }

      const isNetworkFailure = lastError.status == null || lastError.status === 0;
      if (([429, 500, 503].includes(lastError.status) || isNetworkFailure) && attempt < maxAttempts - 1) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("Request failed");
}

function computeRateLimitWait(headers: any, attempt: number) {
  // Prefer standard Retry-After header (seconds)
  const retryAfter = headers?.["retry-after"];
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 60000);
  }

  const raw = headers?.["x-ratelimit-reset-requests"];
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (looksLikeUnixTimestamp(n))
      return Math.max(0, Math.min(60000, n * 1000 - Date.now()));
    if (n >= 0 && n < 86400) return Math.min(60000, n * 1000);
  }
  return calculateBackoff(attempt, 2000, 16000);
}

async function _veniceFetch(
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
  if (isElectron()) {
    return veniceFetchDesktop(endpoint, {
      method,
      body,
      signal,
      dispatch,
      headers,
      isFormData,
      retry,
    }) as Promise<{ data: any; response: Response; headers: any; diagnostics: any }>;
  }

  const startedAt = nowIso();
  const url = `${PROXY_BASE_PATH}${endpoint}`;
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
    try {
      const fetchSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000);
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: isFormData
          ? body
          : body === undefined
          ? undefined
          : JSON.stringify(body),
        signal: fetchSignal,
      });

      diagHeaders = parseDiagnosticsHeaders(response);

      let parsed: any;
      let text = "";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        // use response! to bypass TS check inside catch closure
        parsed = await response.json().catch(() => {
          response!.text().then((t) => { text = t; }).catch(() => {});
          return null;
        });
      } else if (
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      ) {
        const blob = await response.blob();
        parsed = {
          dataUrl: await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Failed to read response blob"));
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
        error: response.ok ? "" : normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText)),
        startedAt,
        endedAt: nowIso(),
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const normalized = diag.error || normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
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

      if (!err.diagnostics) {
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
      }

      if (
        (isFetchFailure || [429, 500, 503].includes(lastError.status)) &&
        attempt < maxAttempts - 1
      ) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Request failed");
}

export async function veniceFetch(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    signal?: AbortSignal;
    dispatch?: any;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    dedupe?: boolean;
  } = {}
): Promise<{ data: any; response: Response; headers: any; diagnostics: any }> {
  const { dedupe = false, method = "GET", body } = options;
  const key = dedupe ? dedupeKey(endpoint, method, body) : "";
  if (dedupe && inFlight.has(key)) {
    return inFlight.get(key)!;
  }

  const promise = _veniceFetch(endpoint, options);

  if (dedupe) {
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key)).catch(() => {});
  }

  return promise;
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
  if (isElectron()) {
    const response = await desktopVenice.streamChat(
      {
        endpoint: "/chat/completions",
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      },
      onDelta,
      signal
    );
    dispatch?.({
      type: "SET_DIAGNOSTICS",
      diagnostics: summarizeDiagnostics({
        endpoint: "/chat/completions",
        method: "POST",
        status: response.status,
        ok: response.ok,
        headers: response.headers || {},
        error: "",
        startedAt,
        endedAt: nowIso(),
      }),
    });
    if (!response.ok) {
      throw new Error(normalizeError(response.status, readDesktopErrorBody(response.body)));
    }
    return;
  }

  const response = await fetch(`${PROXY_BASE_PATH}/chat/completions`, {
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

  try {
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
            json?.choices?.[0]?.text ||
            "";
          if (delta) onDelta(delta);
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}
