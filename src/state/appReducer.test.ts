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
});
