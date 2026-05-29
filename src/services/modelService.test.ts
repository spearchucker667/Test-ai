/** @fileoverview Unit tests for modelService cache behavior. */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Override/mock window.localStorage specifically for Node 26 compatibility
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] || null,
  setItem: (key: string, value: string) => { localStorageStore[key] = String(value); },
  clear: () => { for (const key in localStorageStore) { delete localStorageStore[key]; } },
  removeItem: (key: string) => { delete localStorageStore[key]; },
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

vi.mock('./veniceClient', () => ({ veniceFetch: vi.fn() }));

import { refreshModels } from './modelService';
import { veniceFetch } from './veniceClient';

/** Mocked dispatch function for testing reducer interactions. */
const dispatch = vi.fn();

const validGroupedModels = {
  text: [{ id: "a" }],
  image: [],
  audio: [],
  video: [],
  embeddings: [],
  unknown: [],
};

/** Resets localStorage, dispatch mocks, and veniceFetch before each test. */
beforeEach(() => { window.localStorage.clear(); dispatch.mockReset(); vi.mocked(veniceFetch).mockReset(); });

/** Tests for modelService cache behavior. */
describe('modelService cache behavior', () => {
  /** Verifies that fresh cached data is returned without a network fetch. */
  it('returns fresh cache without fetch', async () => {
    window.localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: validGroupedModels, fetchedAt: Date.now() }));
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_MODELS', fallback: false }));
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  /** Verifies dispatch of stale cache followed by a network refresh. */
  it('dispatches stale cache then refreshes', async () => {
    window.localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: validGroupedModels, fetchedAt: Date.now()-9999999 }));
    vi.mocked(veniceFetch).mockResolvedValue({ data: { data:[{id:'x',type:'text',name:'x'}] } } as any);
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalled();
    expect(veniceFetch).toHaveBeenCalled();
  });

  it("ignores malformed cache shape and fetches live models", async () => {
    window.localStorage.setItem(
      "venice-forge-models-cache",
      JSON.stringify({ grouped: { text: "bad-shape" }, fetchedAt: "oops" })
    );
    vi.mocked(veniceFetch).mockResolvedValue({
      data: { data: [{ id: "x", type: "text", name: "x" }] },
    } as any);

    await refreshModels(dispatch, false);

    expect(veniceFetch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_MODELS" }));
  });
});
