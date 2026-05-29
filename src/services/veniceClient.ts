/** @fileoverview Single entry point for all Venice API calls from the renderer. */

// Code Owner: fayeblade (@spearchucker667)
import { DIAG_HEADER_NAMES } from "../constants/venice";
import { PROXY_BASE_PATH } from "../shared/apiConfig";
import { desktopVenice, isElectron } from "./desktopBridge";
import type { VeniceForgeResponse } from "../types/desktop";
import type { DiagnosticsEntry } from "../types/venice";
import type { AppDispatch } from "../types/app";
import { MIB, VENICE_MAX_RAW_UPLOAD_BYTES, VENICE_MAX_SERIALIZED_UPLOAD_BYTES } from "../shared/limits";

/** Maximum raw upload file size accepted by the renderer. */
export const MAX_RAW_UPLOAD_BYTES = VENICE_MAX_RAW_UPLOAD_BYTES;

/** Maximum serialized upload size accepted over IPC. */
export const MAX_SERIALIZED_UPLOAD_BYTES = VENICE_MAX_SERIALIZED_UPLOAD_BYTES;

/** In-flight request deduplication map (API-004). */
const inFlight = new Map<string, Promise<{ data: unknown; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>>();

/**
 * Generates a deduplication key from request parameters.
 * @param endpoint The API endpoint.
 * @param method The HTTP method.
 * @param body The request body.
 * @returns A string key suitable for deduplicating identical requests.
 */
function dedupeKey(endpoint: string, method: string, body: unknown): string {
  const bodyHash = body === undefined ? "" : JSON.stringify(body);
  return `${method} ${endpoint} ${bodyHash}`;
}

/**
 * Returns the current timestamp as an ISO 8601 string.
 * @returns The current time in ISO format.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Pauses execution for a given duration, optionally respecting an abort signal.
 * @param ms The number of milliseconds to sleep.
 * @param signal An optional abort signal to cancel the sleep early.
 * @returns A promise that restores after the delay or rejects if aborted.
 */
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

/**
 * Calculates an exponential backoff delay for a given retry attempt.
 * @param attempt The current retry attempt number (0-indexed).
 * @param baseMs The base delay in milliseconds.
 * @param maxMs The maximum delay cap in milliseconds.
 * @returns The computed backoff delay.
 */
function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 8000): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

/**
 * Checks whether a number resembles a Unix timestamp (seconds since epoch).
 * @param n The number to evaluate.
 * @returns True if the value looks like a Unix timestamp.
 */
function looksLikeUnixTimestamp(n: number) {
  return Number.isFinite(n) && n > 1000000000 && n < 9999999999;
}

/**
 * Extracts known diagnostic headers from a response object.
 * @param response The fetch Response to inspect.
 * @returns A record of header names to their string values.
 */
function parseDiagnosticsHeaders(response: Response) {
  const headers: Record<string, string> = {};
  DIAG_HEADER_NAMES.forEach((name) => {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  });
  return headers;
}

/**
 * Serialized entry type for Form Data payload.
 */
interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

/**
 * Serialized FormData type.
 */
interface SerializedFormData {
  _isSerializedFormData: boolean;
  entries: SerializedFormDataEntry[];
}

/**
 * Extracts the model identifier from request or response payloads.
 * @param requestBody The request body.
 * @param responseBody The parsed response body.
 * @returns The model identifier if found, otherwise null.
 */
export function extractModelName(requestBody: unknown, responseBody: unknown): string | null {
  if (responseBody && typeof responseBody === "object") {
    const resp = responseBody as Record<string, unknown>;
    if (typeof resp.model === "string") return resp.model;
  }
  if (requestBody) {
    const req = requestBody as Record<string, unknown>;
    if (typeof req.get === "function") {
      const val = (req.get as (key: string) => unknown)("model");
      if (typeof val === "string") return val;
    }
    if (typeof req === "object") {
      if (req._isSerializedFormData && Array.isArray(req.entries)) {
        const entry = req.entries.find((e: unknown) => {
          const item = e as Record<string, unknown>;
          return item && item.name === "model";
        }) as Record<string, unknown> | undefined;
        if (entry && typeof entry.value === "string") return entry.value;
      }
      if (typeof req.model === "string") return req.model;
    }
  }
  return null;
}

/** Input fields for summarizing diagnostics. */
export interface SummarizeDiagnosticsInput {
  endpoint: string;
  method: string;
  status?: number | string | null;
  ok?: boolean;
  headers?: Record<string, string>;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string | null;
}

/**
 * Summarizes request metadata into a diagnostic snapshot.
 * @param params The raw request and response fields.
 * @returns A normalized diagnostics object with latency and header info.
 */
export function summarizeDiagnostics({
  endpoint,
  method,
  status,
  ok,
  headers,
  error,
  startedAt,
  endedAt,
  model,
}: SummarizeDiagnosticsInput): Partial<DiagnosticsEntry> {
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
    model: model || null,
  };
}

/**
 * Normalizes an HTTP error status and raw message into a user-friendly string.
 * @param status The HTTP status code, or null if unavailable.
 * @param rawMessage The original error message.
 * @returns A formatted error string combining the status and message.
 */
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

/**
 * Extracts a readable error message from a desktop API response body.
 * @param body The parsed response body from the main process.
 * @returns A human-readable error string.
 */
function readDesktopErrorBody(body: unknown): string {
  if (!body || typeof body !== "object") return String(body || "Unknown Venice API error");
  const record = body as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) return typeof top === "object" ? JSON.stringify(top) : String(top);
  
  const details = record.details;
  if (details && typeof details === "object") {
    const detailsRec = details as Record<string, unknown>;
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0]);
    for (const key of Object.keys(detailsRec)) {
      if (key === "_errors") continue;
      const val = detailsRec[key] as Record<string, unknown> | undefined;
      const errs = val?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(record.detail || record.text || "Unknown Venice API error");
}

/**
 * Extracts a readable error message from a web-mode API response.
 * @param parsed The parsed JSON body, if available.
 * @param text The raw response text.
 * @param statusText The HTTP status text.
 * @returns A human-readable error string.
 */
export function readWebErrorBody(parsed: unknown, text: string, statusText: string): string {
  if (!parsed || typeof parsed !== "object") return String(parsed || text || statusText || "Unknown Venice API error");
  const record = parsed as Record<string, unknown>;
  const errorObj = record.error as Record<string, unknown> | undefined;
  const top = errorObj?.message || record.error || record.message;
  if (top) return typeof top === "object" ? JSON.stringify(top) : String(top);
  
  const details = record.details;
  if (details && typeof details === "object") {
    const detailsRec = details as Record<string, unknown>;
    if (Array.isArray(detailsRec._errors) && detailsRec._errors.length) return String(detailsRec._errors[0]);
    for (const key of Object.keys(detailsRec)) {
      if (key === "_errors") continue;
      const val = detailsRec[key] as Record<string, unknown> | undefined;
      const errs = val?._errors;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(record.detail || text || statusText || "Unknown Venice API error");
}

/**
 * Serializes a FormData instance into a plain object safe for IPC.
 * @param formData The FormData to serialize.
 * @returns A promise resolving to the serialized representation.
 */
async function serializeFormData(formData: FormData): Promise<SerializedFormData> {
  const entries: SerializedFormDataEntry[] = [];
  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      const estimatedSerializedBytes = Math.ceil(arrayBuffer.byteLength * 4 / 3);
      if (arrayBuffer.byteLength > MAX_RAW_UPLOAD_BYTES) {
        throw new Error(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      if (estimatedSerializedBytes > MAX_SERIALIZED_UPLOAD_BYTES) {
        throw new Error(`Serialized upload too large. Maximum raw upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      const bytes = new Uint8Array(arrayBuffer);
      // 0x8000 (32 KiB) chunks avoid stack overflow when spreading large typed arrays.
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
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

/** Custom error structure for Venice client requests. */
interface VeniceApiError extends Error {
  status?: number | null;
  diagnostics?: Partial<DiagnosticsEntry>;
}

/**
 * Performs a Venice API request through the desktop IPC bridge with retries.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function veniceFetchDesktop(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
  } = {}
): Promise<{ data: unknown; response: VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  // Serialize FormData before crossing the IPC boundary.
  let serializedBody = body;
  if (isFormData && body instanceof FormData) {
    serializedBody = await serializeFormData(body);
  }
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = nowIso();
    let diagHeaders: Record<string, string> = {};
    let response: VeniceForgeResponse | null = null;
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
      const modelName = extractModelName(serializedBody, response.body);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: errorMsg,
        startedAt,
        endedAt: nowIso(),
        model: modelName,
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
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        error.diagnostics = diag; // marks as already dispatched
        throw error;
      }

      return { data: response.body, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const errorObj = err as VeniceApiError;
      const normalized = errorObj.message || "Desktop Venice transport failed.";
      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? null;
      // Skip re-dispatch for HTTP errors already dispatched in the try block.
      if (!errorObj.diagnostics) {
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
            model: extractModelName(serializedBody, response?.body),
          }),
        });
      }

      const isNetworkFailure = lastError.status == null || lastError.status === 0;
      const isRetryableStatus =
        typeof lastError.status === "number" && [429, 500, 503].includes(lastError.status);
      if (
        (isNetworkFailure || isRetryableStatus) &&
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

/**
 * Computes how long to wait before retrying a rate-limited request.
 * @param headers The response headers containing rate-limit info.
 * @param attempt The current retry attempt number.
 * @returns The wait time in milliseconds.
 */
function computeRateLimitWait(headers: unknown, attempt: number) {
  const record = headers as Record<string, string> | undefined;
  // Prefer standard Retry-After header (seconds)
  const retryAfter = record?.["retry-after"];
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n) && n >= 0) return Math.min(n * 1000, 60000);
  }

  const raw = record?.["x-ratelimit-reset-requests"];
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (looksLikeUnixTimestamp(n))
      return Math.max(0, Math.min(60000, n * 1000 - Date.now()));
    if (n >= 0 && n < 86400) return Math.min(60000, n * 1000);
  }
  return calculateBackoff(attempt, 2000, 16000);
}

/**
 * Internal Venice API fetch implementation that routes to desktop or web mode.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function _veniceFetch(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
  } = {}
): Promise<{ data: unknown; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  if (isElectron()) {
    return veniceFetchDesktop(endpoint, {
      method,
      body,
      signal,
      dispatch,
      headers,
      isFormData,
      retry,
    });
  }

  const startedAt = nowIso();
  const url = `${PROXY_BASE_PATH}${endpoint}`;
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");

    const requestHeaders: Record<string, string> = {
      ...headers,
    };
    if (!isFormData) requestHeaders["Content-Type"] = "application/json";

    let response: Response | null = null;
    let diagHeaders: Record<string, string> = {};
    let parsed: unknown = null;
    try {
      const fetchSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000);
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: isFormData
          ? (body as FormData)
          : body === undefined
          ? undefined
          : JSON.stringify(body),
        signal: fetchSignal,
      });

      diagHeaders = parseDiagnosticsHeaders(response);

      let text = "";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = null;
        }
      } else if (
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      ) {
        const blob = await response.blob();
        parsed = {
          dataUrl: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
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

      const modelName = extractModelName(body, parsed);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: response.ok ? "" : normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText)),
        startedAt,
        endedAt: nowIso(),
        model: modelName,
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

        const error: VeniceApiError = new Error(normalized);
        error.status = response.status;
        error.diagnostics = diag;
        throw error;
      }

      return { data: parsed, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      const errorObj = err as VeniceApiError;
      const isFetchFailure =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "TimeoutError");
      const normalized = isFetchFailure
        ? "Fetch failure: likely CORS, network, browser sandbox, timeout, or blocked request. " +
          (errorObj.message || "")
        : errorObj.message || "Request failed";

      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? null;

      if (!errorObj.diagnostics) {
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
            model: extractModelName(body, parsed),
          }),
        });
      }

      const retryableStatus =
        lastError.status !== undefined &&
        lastError.status !== null &&
        [429, 500, 503].includes(lastError.status);

      if ((isFetchFailure || retryableStatus) && attempt < maxAttempts - 1) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Fetches data from the Venice API with automatic retries, deduplication, and diagnostics.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, dispatch, and retry flags.
 * @returns A promise resolving to the parsed data, raw response, headers, and diagnostics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function veniceFetch<T = any>(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    dedupe?: boolean;
  } = {}
): Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  const { dedupe = false, method = "GET", body } = options;
  const key = dedupe ? dedupeKey(endpoint, method, body) : "";
  if (dedupe && inFlight.has(key)) {
    return inFlight.get(key) as Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>;
  }

  const promise = _veniceFetch(endpoint, options);

  if (dedupe) {
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key)).catch(() => {});
  }

  return promise as unknown as Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>;
}

/**
 * Streams a chat completion from the Venice API, yielding deltas via a callback.
 * @param payload The chat completion request payload.
 * @param options Streaming options including signal, dispatch, and onDelta callback.
 */
export async function veniceStreamChat(
  payload: unknown,
  {
    signal,
    dispatch,
    onDelta,
  }: { signal?: AbortSignal; dispatch?: AppDispatch; onDelta: (delta: string) => void }
) {
  const startedAt = nowIso();
  const payloadRecord = payload as Record<string, unknown> | null | undefined;
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
        error: response.ok
          ? ""
          : normalizeError(response.status, readDesktopErrorBody(response.body)),
        startedAt,
        endedAt: nowIso(),
        model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
      }),
    });
    if (!response.ok) {
      throw new Error(normalizeError(response.status, readDesktopErrorBody(response.body)));
    }
    return;
  }

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // REL-001: always enforce a ceiling timeout on the streaming fetch so a stalled
  // SSE connection cannot block the web-mode renderer indefinitely. 5 minutes is
  // generous for even the longest streaming completions.
  const STREAM_TIMEOUT_MS = 300_000;
  const streamSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(STREAM_TIMEOUT_MS)])
    : AbortSignal.timeout(STREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE_PATH}/chat/completions`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload),
      signal: streamSignal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Stream timed out after 5 minutes. The server may be overloaded — please try again.");
    }
    throw err;
  }

  const headers = parseDiagnosticsHeaders(response);
  let streamError = "";
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON error body — use raw text */ }
    streamError = normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
  }

  dispatch?.({
    type: "SET_DIAGNOSTICS",
    diagnostics: summarizeDiagnostics({
      endpoint: "/chat/completions",
      method: "POST",
      status: response.status,
      ok: response.ok,
      headers,
      error: streamError,
      startedAt,
      endedAt: nowIso(),
      model: typeof payloadRecord?.model === "string" ? payloadRecord.model : null,
    }),
  });

  if (!response.ok) {
    throw new Error(streamError);
  }

  if (!response.body)
    throw new Error("Streaming is unavailable in this browser sandbox.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "TimeoutError") {
          throw new Error("Stream timed out after 5 minutes. The server may be overloaded — please try again.");
        }
        throw err;
      }
      const { value, done } = result;
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
        } catch { /* malformed SSE JSON chunk — skip */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
