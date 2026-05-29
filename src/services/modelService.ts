/** @fileoverview Fetches and caches the Venice model catalog with stale-while-revalidate behavior. */

import { veniceFetch } from "./veniceClient";
import { flattenModels } from "../state/appReducer";
import { isValidModelListResponse } from "../utils/veniceValidation";
import type { AppDispatch } from "../types/app";

/** localStorage key for the model cache. */
const CACHE_KEY = "venice-forge-models-cache";

/** Cache time-to-live in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Shape of the persisted model cache entry. */
interface ModelsCache {
  grouped: Record<string, unknown[]>;
  fetchedAt: number;
  isStale?: boolean;
}

function isValidGroupedModels(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const grouped = value as Record<string, unknown>;
  const requiredKeys = ["text", "image", "audio", "video", "embeddings", "unknown"];
  return requiredKeys.every((key) => Array.isArray(grouped[key]));
}

/**
 * Reads the model cache from localStorage, marking it stale if expired.
 * @returns The cached data, or null if missing or unreadable.
 */
function readCache(): ModelsCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!isValidGroupedModels(parsed.grouped)) return null;
    if (typeof parsed.fetchedAt !== "number" || !Number.isFinite(parsed.fetchedAt)) return null;
    const isStale = Date.now() - parsed.fetchedAt > CACHE_TTL_MS;
    return { ...parsed, isStale };
  } catch {
    return null;
  }
}

/**
 * Writes grouped model data to localStorage.
 * @param grouped The model groups to cache.
 */
function writeCache(grouped: Record<string, unknown[]>): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ grouped, fetchedAt: Date.now() }));
  } catch {
    // localStorage may be full or unavailable.
  }
}

/**
 * Refreshes the model catalog, serving cached data immediately when available.
 * @param dispatch The app dispatch function for state updates.
 * @param force If true, bypasses the freshness check and always refreshes.
 * @returns A promise that resolves once the refresh attempt completes.
 */
export async function refreshModels(dispatch: AppDispatch, force = false): Promise<void> {
  const cached = readCache();

  // Serve cached data immediately (even if stale) to reduce perceived latency.
  if (cached) {
    dispatch({ type: "SET_MODELS", models: cached.grouped, fallback: false });
    const isStale = !!cached.isStale;
    if (!force && !isStale) {
      return; // Fresh — no background refresh needed.
    }
    // Stale or forced: fall through to background refresh while cached UI is already shown.
  }

  try {
    const { data } = await veniceFetch("/models?type=all", {
      method: "GET",
      dispatch,
      retry: true,
      dedupe: true,
    });
    if (!isValidModelListResponse(data)) {
      throw new Error("Unexpected /models response shape.");
    }
    const grouped = flattenModels(data);
    writeCache(grouped);
    dispatch({ type: "SET_MODELS", models: grouped, fallback: false });
  } catch (err: unknown) {
    // If we already served cached data, swallow the error silently.
    if (!cached) {
      const message = (err as { message?: string })?.message;
      dispatch({
        type: "SET_MODELS",
        models: undefined,
        fallback: true,
        error: message || "Model discovery failed; using non-exhaustive static fallbacks.",
      });
    }
  }
}
