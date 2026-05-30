import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { FIRST_RUN_COPY } from "../shared/legal";

interface FirstRunModalProps {
  open: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
}

export function FirstRunModal({ open, onAcknowledge, onDismiss }: FirstRunModalProps) {
  const ackRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const prevOverflowRef = useRef<string>("");

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      prevOverflowRef.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      setTimeout(() => ackRef.current?.focus(), 50);
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

  useFocusTrap(modalRef, open, onDismiss);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-overlay/60 p-6 backdrop-blur-2xl animate-[fadeIn_0.3s_ease]"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-border/50 bg-surface/90 p-6 shadow-[0_24px_64px_var(--overlay),0_0_0_1px_var(--glow)] backdrop-blur-xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        aria-describedby="first-run-detail"
      >
        <h2 id="first-run-title" className="text-lg font-display font-semibold text-text-primary mb-2">
          {FIRST_RUN_COPY.title}
        </h2>
        <div id="first-run-detail" className="text-sm text-text-secondary mb-6 leading-relaxed space-y-3 whitespace-pre-line">
          {FIRST_RUN_COPY.body}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
          <a
            href="https://venice.ai/brand"
            target="_blank"
            rel="noopener noreferrer"
            className="btn text-center"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {FIRST_RUN_COPY.docsLabel}
          </a>
          <button ref={ackRef} className="btn primary" onClick={onAcknowledge}>
            {FIRST_RUN_COPY.agreeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
