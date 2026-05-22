/** @fileoverview Unit tests for modelService cache behavior. */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./veniceClient', () => ({ veniceFetch: vi.fn() }));

import { refreshModels } from './modelService';
import { veniceFetch } from './veniceClient';

/** Mocked dispatch function for testing reducer interactions. */
const dispatch = vi.fn();

/** Resets localStorage, dispatch mocks, and veniceFetch before each test. */
beforeEach(() => { localStorage.clear(); dispatch.mockReset(); vi.mocked(veniceFetch).mockReset(); });

/** Tests for modelService cache behavior. */
describe('modelService cache behavior', () => {
  /** Verifies that fresh cached data is returned without a network fetch. */
  it('returns fresh cache without fetch', async () => {
    localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: { text: [{id:'a'}] }, fetchedAt: Date.now() }));
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_MODELS', fallback: false }));
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  /** Verifies dispatch of stale cache followed by a network refresh. */
  it('dispatches stale cache then refreshes', async () => {
    localStorage.setItem('venice-forge-models-cache', JSON.stringify({ grouped: { text: [{id:'a'}] }, fetchedAt: Date.now()-9999999 }));
    vi.mocked(veniceFetch).mockResolvedValue({ data: { data:[{id:'x',type:'text',name:'x'}] } } as any);
    await refreshModels(dispatch, false);
    expect(dispatch).toHaveBeenCalled();
    expect(veniceFetch).toHaveBeenCalled();
  });
});
