import React from 'react';

export function Chip({ children, tone = "", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  return <span className={`chip ${tone} ${className}`.trim()}>{children}</span>;
}
