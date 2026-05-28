import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ConfirmModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Primary question shown in the modal heading. */
  message: string;
  /** Optional longer explanation rendered below the heading. */
  detail?: string;
  /** Label for the confirm action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel action button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Tone for the confirm button: "danger" renders a red button. Defaults to "danger". */
  confirmTone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  const prevOverflowRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      prevOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Default focus on the safe/cancel action.
      setTimeout(() => cancelRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = prevOverflowRef.current;
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
      returnFocusRef.current = null;
    }
    return () => {
      document.body.style.overflow = prevOverflowRef.current;
    };
  }, [open]);

  useFocusTrap(modalRef, open, onCancel);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={detail ? "confirm-modal-detail" : undefined}
        style={{ maxWidth: 420, width: "100%", padding: 24 }}
      >
        <h2 id="confirm-modal-title" style={{ marginBottom: detail ? 8 : 20 }}>
          {message}
        </h2>
        {detail && (
          <p id="confirm-modal-detail" className="small muted" style={{ marginBottom: 20 }}>
            {detail}
          </p>
        )}
        <div className="chip-row" style={{ justifyContent: "flex-end" }}>
          <button ref={cancelRef} className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${confirmTone}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
