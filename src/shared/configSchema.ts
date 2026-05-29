// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Central validation and typing for environment configuration.
 */
import { VENICE_MAX_BODY_BYTES } from "./limits";

export interface EnvConfig {
  VENICE_API_KEY?: string;
  VENICE_API_HOST: string;
  VENICE_API_BASE_PATH: string;
  VENICE_API_TIMEOUT_MS: number;
  PORT: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  MAX_PROXY_BODY_BYTES: number;
  NODE_ENV: string;
  TRUST_PROXY?: string | number;
}

export function parsePositiveInt(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  if (!rawValue) return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function env(key: string, fallback: string): string {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) {
      return process.env[key]!;
    }
  } catch {
    // Sandbox
  }
  return fallback;
}

export const AppConfig: EnvConfig = {
  get VENICE_API_KEY() { return env("VENICE_API_KEY", ""); },
  get VENICE_API_HOST() { return env("VENICE_API_HOST", "api.venice.ai"); },
  get VENICE_API_BASE_PATH() { return env("VENICE_API_BASE_PATH", "/api/v1"); },
  get VENICE_API_TIMEOUT_MS() { return parsePositiveInt(env("VENICE_API_TIMEOUT_MS", env("VENICE_TIMEOUT_MS", "60000")), 60000, 1000, 300000); },
  get PORT() { return parsePositiveInt(env("PORT", "3000"), 3000, 1, 65535); },
  get RATE_LIMIT_WINDOW_MS() { return parsePositiveInt(env("RATE_LIMIT_WINDOW_MS", "60000"), 60000, 1000, 3600000); },
  get RATE_LIMIT_MAX_REQUESTS() { return parsePositiveInt(env("RATE_LIMIT_MAX_REQUESTS", "60"), 60, 1, 10000); },
  get MAX_PROXY_BODY_BYTES() {
    const fallback = VENICE_MAX_BODY_BYTES;
    return parsePositiveInt(env("MAX_PROXY_BODY_BYTES", String(fallback)), fallback, 1024, fallback);
  },
  get NODE_ENV() { return env("NODE_ENV", "development"); },
  get TRUST_PROXY() { 
    const trustProxyRaw = env("TRUST_PROXY", "");
    if (!trustProxyRaw) return undefined;
    const numeric = Number(trustProxyRaw);
    return Number.isFinite(numeric) ? numeric : trustProxyRaw;
  }
};
