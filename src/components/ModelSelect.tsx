import React from "react";

export function ModelSelect({
  value,
  models,
  onChange,
}: {
  value: string;
  models: any[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {(models || []).map((m) => (
        <option key={m.id} value={m.id}>
          {m.id}
        </option>
      ))}
    </select>
  );
}
