export interface ModelInfo {
  id: string;
  created: number;
  object: string;
  owned_by: string;
}

export interface ModelGroups {
  text: ModelInfo[];
  image: ModelInfo[];
  vision: ModelInfo[];
}

export interface DiagnosticsEntry {
  id: string;
  timestamp: number;
  type: "info" | "warn" | "error" | "success";
  endpoint: string;
  status: number | string;
  latencyMs: number;
  reqSize: number;
  resSize: number;
  error?: string;
  data?: any;
}
