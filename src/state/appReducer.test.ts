import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "./appReducer";

describe("appReducer", () => {
  it("should change active tab", () => {
    const nextState = appReducer(initialState, { type: "SET_TAB", tab: "gallery" });
    expect(nextState.activeTab).toBe("gallery");
  });

  it("should toggle source panel", () => {
    const before = initialState.sourcePanelOpen;
    const nextState = appReducer(initialState, { type: "TOGGLE_SOURCE_PANEL" });
    expect(nextState.sourcePanelOpen).toBe(!before);
  });

  it("should format and push diagnostics logs", () => {
    const entry = { type: "info" as const, message: "Testing" };
    const nextState = appReducer(initialState, { type: "SET_DIAGNOSTICS", diagnostics: entry });
    expect(nextState.diagnosticsLog.length).toBe(1);
    expect(nextState.diagnosticsLog[0].message).toBe("Testing");
  });

  it("should add and remove toasts", () => {
    const toast = { id: "t1", message: "Hello", type: "info" as const };
    const state1 = appReducer(initialState, { type: "ADD_TOAST", toast });
    expect(state1.toasts.length).toBe(1);
    expect(state1.toasts[0].id).toBe("t1");

    const state2 = appReducer(state1, { type: "REMOVE_TOAST", id: "t1" });
    expect(state2.toasts.length).toBe(0);
  });

  // SEC-019 regression guard: prototype pollution via SET_SETTINGS
  it("should ignore __proto__ and constructor keys in SET_SETTINGS", () => {
    const nextState = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { __proto__: { evil: true }, constructor: { evil: true }, defaultSystemPrompt: "updated" } as any,
    });
    expect(nextState.settings.defaultSystemPrompt).toBe("updated");
    // Verify evil property was NOT added to the prototype
    expect((Object.getPrototypeOf(nextState.settings) as any).evil).toBeUndefined();
    expect(Object.getPrototypeOf(nextState.settings)).toBe(Object.prototype);
  });

  // BUG-007 regression guard: legacy boolean webSearch settings must be coerced
  it("coerces legacy webSearch values to allowed enum strings", () => {
    const fromTrue = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: true as any },
    });
    expect(fromTrue.settings.webSearch).toBe("on");

    const fromFalse = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: false as any },
    });
    expect(fromFalse.settings.webSearch).toBe("off");

    const fromInvalid = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: "invalid" as any },
    });
    expect(fromInvalid.settings.webSearch).toBe("off");
  });
});
