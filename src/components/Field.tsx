import React, { useId } from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  
  let childWithId = children;
  let targetId: string | undefined = undefined;

  if (React.isValidElement(children)) {
    const childElement = children as React.ReactElement<any>;
    targetId = childElement.props.id || generatedId;
    childWithId = React.cloneElement(childElement, { id: targetId });
  }

  return (
    <div className="field">
      <label htmlFor={targetId}>{label}</label>
      {childWithId}
    </div>
  );
}
