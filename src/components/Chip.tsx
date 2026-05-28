import React from 'react';

const toneClasses: Record<string, string> = {
  ok: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
  warn: "text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
  danger: "text-red-400 border-red-500/30 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.1)]",
  running: "text-violet-400 border-violet-500/40 bg-violet-500/10 shadow-[0_0_10px_rgba(139,92,246,0.2)]",
  default: "text-zinc-100 border-white/5 bg-[rgba(25,23,38,0.65)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
};

export function Chip({ children, tone = "", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  const baseClasses = "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium leading-snug backdrop-blur-sm transition-all duration-200 border";
  const appliedTone = toneClasses[tone] || toneClasses.default;
  
  return (
    <span className={`${baseClasses} ${appliedTone} ${className}`.trim()}>
      {children}
    </span>
  );
}
