/** @fileoverview Performs HTTPS requests to the Venice API from the Electron
 *  main process, including streaming chat and multipart form data support. */

import crypto from "crypto";
import https from "https";
import { app } from "electron";
import type { IncomingHttpHeaders } from "http";
import { getApiKey } from "./secureStore";
import { logError, setLastApiError } from "./logger";
import { validateVeniceIpcRequest } from "../ipc/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH, VENICE_API_TIMEOUT_MS } from "../../src/shared/apiConfig";

/** Hostname for the Venice API. */
const VENICE_HOST = VENICE_API_HOST;

/** Base path prefix for Venice API endpoints. */
const VENICE_BASE_PATH = VENICE_API_BASE_PATH;

/** Maximum non-streaming Venice response body size we will buffer in memory. */
const MAX_VENICE_RESPONSE_BYTES = 25 * 1024 * 1024;

/** Tracks active requests so they can be aborted by signal ID. */
const activeRequests = new Map<string, { destroy: () => void }>();

/** Describes a single entry within a serialized FormData payload. */
interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

/** Describes a FormData object serialized from the renderer for multipart upload. */
interface SerializedFormData {
  _isSerializedFormData: true;
  entries: SerializedFormDataEntry[];
}

/** Removes carriage returns, newlines, and quotes from a multipart token.
 *  @param value The raw token string.
 *  @returns A sanitized token safe for multipart headers.
 */
export function sanitizeMultipartToken(value: string): string {
  return value.replace(/[\r\n"]/g, "").trim();
}

/** Validates and normalizes a multipart content-type string.
 *  @param value The raw content-type value.
 *  @returns A valid MIME type or application/octet-stream fallback.
 */
export function sanitizeMultipartContentType(value: string | undefined): string {
  const sanitized = sanitizeMultipartToken(value || "");
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(sanitized)
    ? sanitized
    : "application/octet-stream";
}

/** Builds a multipart form-data body from a serialized FormData description.
 *  @param serialized The serialized FormData structure.
 *  @returns The assembled body buffer and boundary string.
 */
export function buildMultipartBody(serialized: SerializedFormData): { body: Buffer; boundary: string } {
  const boundary = `----VeniceForgeBoundary${crypto.randomBytes(16).toString("hex")}`;
  const parts: Buffer[] = [];

  for (const entry of serialized.entries) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    if (entry._isFile && entry.filename) {
      const safeName = sanitizeMultipartToken(entry.name);
      const safeFilename = sanitizeMultipartToken(entry.filename);
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${safeName}"; filename="${safeFilename}"\r\n`));
      parts.push(Buffer.from(`Content-Type: ${sanitizeMultipartContentType(entry.type)}\r\n\r\n`));
      parts.push(Buffer.from(entry.value, "base64"));
    } else {
      const safeName = sanitizeMultipartToken(entry.name);
      parts.push(Buffer.from(`Content-Disposition: form-data; name="${safeName}"\r\n\r\n`));
      parts.push(Buffer.from(entry.value, "utf-8"));
    }
    parts.push(Buffer.from(`\r\n`));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

/** Describes the standard shape of a Venice API response returned to the renderer. */
export interface VeniceIpcResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
}

/** Strips sensitive headers from an incoming HTTP response.
 *  @param headers The raw response headers.
 *  @returns A sanitized record of safe headers.
 */
function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|cookie|set-cookie/i.test(key)) continue;
    if (Array.isArray(value)) result[key] = value.join(", ");
    else if (typeof value === "string") result[key] = value;
  }
  return result;
}

/** Parses an HTTP response body based on its content-type.
 *  @param buffer The raw response bytes.
 *  @param contentType The declared content-type header.
 *  @returns Parsed JSON, plain text, or base64-encoded data.
 */
function parseBody(buffer: Buffer, contentType: string): unknown {
  const text = buffer.toString("utf-8");
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text: "Venice returned malformed JSON." };
    }
  }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) return text;
  return { dataBase64: buffer.toString("base64") };
}

/** Extracts the text delta from a server-sent event data payload.
 *  @param data The raw SSE data line.
 *  @returns The extracted content delta, if any.
 */
function extractStreamDelta(data: string): string {
  try {
    const json = JSON.parse(data);
    return (
      json?.choices?.[0]?.delta?.content ||
      json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.text ||
      ""
    );
  } catch {
    return "";
  }
}

/** Parses SSE-formatted lines and invokes a callback for each text delta.
 *  @param buffer The accumulated SSE buffer.
 *  @param onDelta Callback invoked for each valid delta.
 *  @returns The remaining unparsed buffer and concatenated text.
 */
function parseSseLines(buffer: string, onDelta: (delta: string) => void): { buffer: string; text: string } {
  const lines = buffer.split(/\r?\n/);
  const tail = lines.pop() || "";
  let text = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.replace(/^data:\s*/, "");
    if (!data || data === "[DONE]") continue;
    const delta = extractStreamDelta(data);
    if (delta) {
      text += delta;
      onDelta(delta);
    }
  }
  return { buffer: tail, text };
}

/** Aborts an active Venice request by its signal ID.
 *  @param signalId The unique identifier for the active request.
 *  @returns An object indicating whether an active request was found and destroyed.
 */
export function abortVeniceRequest(signalId: string): { ok: boolean } {
  const active = activeRequests.get(signalId);
  if (!active) return { ok: false };
  active.destroy();
  activeRequests.delete(signalId);
  return { ok: true };
}

/** Sends a validated Venice API request and returns the parsed response.
 *  @param rawRequest The raw request payload to validate and send.
 *  @param options Optional callbacks for streaming deltas.
 *  @returns A promise resolving with the Venice API response.
 */
export async function performVeniceRequest(
  rawRequest: unknown,
  options: { onDelta?: (delta: string) => void } = {}
): Promise<VeniceIpcResponse> {
  const request = validateVeniceIpcRequest(rawRequest);
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      body: { error: "Venice API key is not configured. Add it in Settings." },
      contentType: "application/json",
    };
  }

  return new Promise<VeniceIpcResponse>((resolve, reject) => {
    let bodyText: string | Buffer | undefined;
    let contentTypeOverride: string | undefined;

    // Detect serialized FormData from the renderer and rebuild multipart body.
    const serializedForm = request.body as SerializedFormData | undefined;
    if (serializedForm && typeof serializedForm === "object" && serializedForm._isSerializedFormData) {
      const { body, boundary } = buildMultipartBody(serializedForm);
      bodyText = body;
      contentTypeOverride = `multipart/form-data; boundary=${boundary}`;
    } else {
      bodyText = request.body === undefined ? undefined : JSON.stringify(request.body);
    }

    const path = `${VENICE_BASE_PATH}${request.endpoint}`;
    const headers: Record<string, string | number> = {
      ...request.headers,
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": `VeniceForge/${app.getVersion()}`,
    };

    if (bodyText !== undefined) {
      headers["Content-Type"] = contentTypeOverride || headers["Content-Type"] || "application/json";
      headers["Content-Length"] = Buffer.isBuffer(bodyText) ? bodyText.length : Buffer.byteLength(bodyText);
    }

    const req = https.request(
      {
        hostname: VENICE_HOST,
        path,
        method: request.method,
        headers,
        timeout: VENICE_API_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        const responseHeaders = sanitizeHeaders(res.headers);
        const contentType = String(res.headers["content-type"] || "");
        let sseBuffer = "";
        let streamText = "";

        res.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_VENICE_RESPONSE_BYTES) {
            req.destroy(new Error("Response too large"));
            return;
          }

          if (options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400) {
            sseBuffer += chunk.toString("utf-8");
            const parsed = parseSseLines(sseBuffer, options.onDelta);
            sseBuffer = parsed.buffer;
            streamText += parsed.text;
          } else {
            chunks.push(chunk);
          }
        });

        res.on("end", () => {
          if (options.onDelta && sseBuffer) {
            const parsed = parseSseLines(`${sseBuffer}\n`, options.onDelta);
            streamText += parsed.text;
          }
          const buffer = Buffer.concat(chunks);
          const body =
            options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400
              ? { text: streamText }
              : parseBody(buffer, contentType);
          resolve({
            ok: !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: responseHeaders,
            body,
            contentType,
          });
        });
      }
    );

    const cleanup = () => {
      if (request.signalId) activeRequests.delete(request.signalId);
    };

    if (request.signalId) {
      activeRequests.set(request.signalId, {
        destroy: () => req.destroy(new Error("Request aborted")),
      });
    }

    req.on("error", (err) => {
      const message =
        err.message === "Request aborted"
          ? "Request aborted"
          : err.message === "Response too large"
          ? "Venice response exceeded the local safety limit."
          : "Failed to reach Venice API.";
      if (message !== "Request aborted") {
        setLastApiError(message);
        logError("Venice API request failed", err);
      }
      reject(new Error(message));
    });
    req.on("timeout", () => {
      req.destroy(new Error("Connection timed out"));
    });
    req.on("close", cleanup);

    if (bodyText !== undefined) req.write(bodyText);
    req.end();
  }).then((response) => {
    if (!response.ok) setLastApiError(readResponseError(response));
    return response;
  });
}

/** Extracts a human-readable error message from a Venice API response.
 *  @param response The Venice response to inspect.
 *  @returns The most specific error message available.
 */
export function readResponseError(response: VeniceIpcResponse): string {
  const body = response.body && typeof response.body === "object"
    ? (response.body as Record<string, unknown>)
    : {};
  const error = body.error;
  const top =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : error || body.message;
  if (top) return typeof top === "object" ? JSON.stringify(top) : String(top);
  // Venice DetailedError (Zod): { details: { _errors?: string[], field?: { _errors: string[] } } }
  const details = body.details;
  if (details && typeof details === "object") {
    const detailRecord = details as Record<string, unknown>;
    if (Array.isArray(detailRecord._errors) && detailRecord._errors.length) return String(detailRecord._errors[0]);
    for (const key of Object.keys(detailRecord)) {
      if (key === "_errors") continue;
      const field = detailRecord[key];
      const errs =
        field && typeof field === "object"
          ? (field as { _errors?: unknown })._errors
          : undefined;
      if (Array.isArray(errs) && errs.length) return `${key}: ${String(errs[0])}`;
    }
    return "Request validation failed";
  }
  return String(body.detail || response.statusText || `HTTP ${response.status}`);
}
