import React from 'react';

export function StatusBlock({ error, success }: { error?: string; success?: string }) {
  if (error) return <div className="error">{error}</div>;
  if (success) return <div className="success">{success}</div>;
  return null;
}
