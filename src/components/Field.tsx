import React, { useId } from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  
  let childWithId = children;
  let targetId: string | undefined = undefined;

  if (React.isValidElement(children)) {
    const childElement = children as React.ReactElement<{ id?: string }>;
    targetId = childElement.props.id || generatedId;
    childWithId = React.cloneElement(childElement, { id: targetId });
  }

  return (
    <div className="grid gap-2.5">
      <label htmlFor={targetId} className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 font-display">{label}</label>
      {childWithId}
    </div>
  );
}
