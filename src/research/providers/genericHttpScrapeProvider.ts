// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Generic public HTTP scrape provider with SSRF defenses.
 *
 * This provider is a minimal fallback for public web pages.
 * It is DISABLED by default and must be explicitly enabled.
 *
 * SSRF defense: hostnames and IP literals are checked against a static
 * blocklist BEFORE any network request. No DNS resolution is performed.
 */

import type {
  ResearchProvider,
  ResearchProviderId,
  ScrapeInput,
  ScrapeResult,
} from "../providerTypes";

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/json",
];

const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MiB

export interface GenericHttpConfig {
  /** Must be explicitly set to true to enable this provider. */
  enabled?: boolean;
  /** Maximum response body bytes to read. */
  maxResponseBytes?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Checks whether a URL is safe to fetch (SSRF blocklist). */
export function isSafeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Block localhost and local/internal names
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return false;
  }

  // IPv4 checks
  const ipv4 = hostname;
  if (
    ipv4 === "0.0.0.0" ||
    isInCidr(ipv4, "127.0.0.0", 8) ||
    isInCidr(ipv4, "10.0.0.0", 8) ||
    isInCidr(ipv4, "172.16.0.0", 12) ||
    isInCidr(ipv4, "192.168.0.0", 16) ||
    isInCidr(ipv4, "169.254.0.0", 16) ||
    isInCidr(ipv4, "100.64.0.0", 10)
  ) {
    return false;
  }

  // IPv6 checks
  if (hostname === "::1") return false;
  if (isIpv6InCidr(hostname, "fc00::", 7)) return false;
  if (isIpv6InCidr(hostname, "fe80::", 10)) return false;

  // IPv4-mapped IPv6 (::ffff:<private-v4>)
  // URL normalization may compress the IPv4 into hex (e.g. ::ffff:7f00:1).
  if (hostname.startsWith("::ffff:")) {
    const suffix = hostname.slice(7);
    let mappedV4: string | null = null;
    if (suffix.includes(".")) {
      mappedV4 = suffix;
    } else {
      const groups = suffix.split(":").map((g) => g.padStart(4, "0"));
      const hex = groups.join("");
      if (hex.length === 8) {
        mappedV4 = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
          parseInt(hex.slice(6, 8), 16),
        ].join(".");
      }
    }
    if (
      mappedV4 &&
      (mappedV4 === "0.0.0.0" ||
        isInCidr(mappedV4, "127.0.0.0", 8) ||
        isInCidr(mappedV4, "10.0.0.0", 8) ||
        isInCidr(mappedV4, "172.16.0.0", 12) ||
        isInCidr(mappedV4, "192.168.0.0", 16) ||
        isInCidr(mappedV4, "169.254.0.0", 16) ||
        isInCidr(mappedV4, "100.64.0.0", 10))
    ) {
      return false;
    }
  }

  return true;
}

/** Parses an IPv4 string into a 32-bit integer. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/** Checks whether an IPv4 address falls inside a CIDR block. */
function isInCidr(ip: string, network: string, prefix: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(network);
  if (ipInt == null || netInt == null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/** Checks whether an IPv6 address falls inside a CIDR block (basic support). */
function isIpv6InCidr(ip: string, network: string, prefix: number): boolean {
  // Expand both to full 8-group notation
  const expand = (addr: string): string[] | null => {
    const halves = addr.split("::");
    if (halves.length > 2) return null;
    let parts = addr.split(":");
    if (halves.length === 2) {
      const left = halves[0] ? halves[0].split(":") : [];
      const right = halves[1] ? halves[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      parts = [...left, ...Array(missing).fill("0"), ...right];
    }
    if (parts.length !== 8) return null;
    return parts.map((p) => p.padStart(4, "0"));
  };

  const ipParts = expand(ip);
  const netParts = expand(network);
  if (!ipParts || !netParts) return false;

  const fullGroups = Math.floor(prefix / 16);
  const remainder = prefix % 16;

  for (let i = 0; i < fullGroups; i++) {
    if (ipParts[i] !== netParts[i]) return false;
  }

  if (remainder > 0) {
    const ipVal = Number.parseInt(ipParts[fullGroups], 16);
    const netVal = Number.parseInt(netParts[fullGroups], 16);
    const mask = (~0 << (16 - remainder)) & 0xffff;
    if ((ipVal & mask) !== (netVal & mask)) return false;
  }

  return true;
}

/** Reads response text up to a byte limit without consuming the whole body first. */
async function readWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  if (!response.body) {
    return response.text().catch(() => "");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      if (bytesRead >= maxBytes) break;
    }
  } finally {
    reader.releaseLock();
  }

  return buffer;
}

/** Very basic tag stripper for HTML → plain text fallback. */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function composeTimeoutSignal(ms: number, parent?: AbortSignal): AbortSignal {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    const timeoutSignal = AbortSignal.timeout(ms);
    if (parent && typeof AbortSignal !== "undefined" && AbortSignal.any) {
      return AbortSignal.any([parent, timeoutSignal]);
    }
    return timeoutSignal;
  }
  const controller = new AbortController();
  let onAbort: (() => void) | undefined;
  const id = setTimeout(() => {
    if (onAbort && parent) parent.removeEventListener("abort", onAbort);
    controller.abort();
  }, ms);
  if (parent) {
    onAbort = () => {
      clearTimeout(id);
      controller.abort();
    };
    parent.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export function createGenericHttpProvider(config: GenericHttpConfig = {}): ResearchProvider {
  const enabled = config.enabled === true;
  const maxBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return {
    id: "generic-http",
    label: "Generic HTTP",
    supports: {
      search: false,
      scrape: true,
      socialDiscovery: false,
      documentParsing: false,
    },

    async scrape(input: ScrapeInput): Promise<ScrapeResult> {
      if (!enabled) {
        throw new Error(
          "Generic HTTP provider is disabled by default. Enable it explicitly in settings."
        );
      }

      const url = input.url;
      if (!isSafeUrl(url)) {
        throw new Error("URL blocked by SSRF safety check.");
      }

      const signal = input.timeoutMs && input.timeoutMs > 0
        ? composeTimeoutSignal(input.timeoutMs, input.signal)
        : input.signal;

      const response = await fetch(url, {
        method: "GET",
        signal,
        // Do not send cookies or custom user headers
        credentials: "omit",
        headers: {
          Accept: "text/html, text/plain, application/xhtml+xml, application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const allowed = ALLOWED_CONTENT_TYPES.some((t) =>
        contentType.toLowerCase().includes(t)
      );
      if (!allowed) {
        throw new Error(`Content-Type not allowed: ${contentType}`);
      }

      const body = await readWithLimit(response, maxBytes);

      const isHtml =
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml+xml");

      const text = isHtml ? stripHtml(body) : body;

      return {
        provider: "generic-http" as ResearchProviderId,
        url,
        finalUrl: response.url,
        text,
        content: text,
        raw: body,
        fetchedAt: nowIso(),
      };
    },
  };
}
