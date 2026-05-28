import React from "react";

export function TabButton({
  id,
  label,
  active,
  onClick,
  className = "",
  iconOnly = false,
}: {
  key?: React.Key;
  id: string;
  label: string;
  active: boolean;
  onClick: (id: string) => void;
  className?: string;
  iconOnly?: boolean;
}) {
  const icons: Record<string, string> = {
    chat: "✦",
    image: "▧",
    batch: "▤",
    search: "⌕",
    models: "◎",
    gallery: "◫",
    settings: "⚙",
    diagnostics: "◈",
  };

  const baseClasses = "group relative flex items-center gap-3.5 rounded-xl border border-transparent bg-transparent text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus:outline-none w-full";
  const layoutClasses = iconOnly 
    ? "flex-col justify-center h-16 p-3 text-[11px] font-bold uppercase tracking-wider" 
    : "px-5 py-3.5 text-left";
    
  const stateClasses = active
    ? "text-white border-brand-500/30 bg-gradient-to-r from-brand-500/20 to-brand-500/5 shadow-[inset_2px_0_0_#8b5cf6]"
    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5 hover:translate-x-1";

  const iconBase = "grid place-items-center w-5 text-base transition-all duration-300";
  const iconState = active
    ? "text-white drop-shadow-[0_0_12px_rgba(139,92,246,0.8)]"
    : "group-hover:text-zinc-200";

  return (
    <button
      className={`${baseClasses} ${layoutClasses} ${stateClasses} ${className}`.trim()}
      onClick={() => onClick(id)}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <span className={`${iconBase} ${iconState}`} aria-hidden="true">
        {icons[id] || "•"}
      </span>
      {!iconOnly && (
        <span className="truncate">
          {label}
        </span>
      )}
    </button>
  );
}
