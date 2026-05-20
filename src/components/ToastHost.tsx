import React, { useEffect } from "react";
import { AppState, AppDispatch, ToastMessage } from "../types/app";

export function ToastHost({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  return (
    <div className="toast-container" style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {state.toasts?.map((toast) => (
        <ToastItem key={toast.id} toast={toast} dispatch={dispatch} />
      ))}
    </div>
  );
}

function ToastItem({ toast, dispatch }: { toast: ToastMessage; dispatch: AppDispatch }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "REMOVE_TOAST", id: toast.id });
    }, toast.duration || 3000);
    return () => clearTimeout(timer);
  }, [toast, dispatch]);

  const bgColor = toast.type === "error" ? "var(--error)" : toast.type === "success" ? "var(--accent-2)" : "var(--panel-strong)";
  const color = toast.type === "error" ? "#fff" : "var(--text)";

  return (
    <div className={`toast-message toast-${toast.type}`} style={{ background: bgColor, color, padding: "12px 16px", borderRadius: 8, boxShadow: "var(--shadow)", fontSize: 14 }}>
      {toast.message}
    </div>
  );
}
