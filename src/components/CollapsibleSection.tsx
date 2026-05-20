import React, { useState } from "react";

export function CollapsibleSection({ title, children, defaultOpen = false }: { title: React.ReactNode, children: React.ReactNode, defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="collapsible-section" style={{ border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--panel-strong)", overflow: "hidden" }}>
      <button 
        type="button" 
        onClick={() => setOpen(!open)}
        style={{ width: "100%", padding: "12px 16px", background: "transparent", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--text)", fontWeight: 600, fontSize: 12 }}
      >
        <span>{title}</span>
        <span style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: 16, borderTop: "1px solid var(--border-strong)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
