import React from 'react';
import { Chip } from './Chip';

export function DiagPreview({ diagnostics }: { diagnostics: any }) {
  if (!diagnostics) return <Chip>no requests yet</Chip>;
  return (
    <div className="chip-row">
      <Chip tone={diagnostics.ok ? "ok" : "danger"}>
        {diagnostics.status || "network"} {diagnostics.ok ? "OK" : "error"}
      </Chip>
      <Chip>{diagnostics.endpoint}</Chip>
      {diagnostics.headers?.["CF-RAY"] && (
        <Chip>CF-RAY {diagnostics.headers["CF-RAY"]}</Chip>
      )}
    </div>
  );
}
