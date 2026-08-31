export interface SemgrepPosition {
  line: number;
  col: number;
  offset: number;
}

export interface SemgrepMetadata {
  cwe?: string | string[];
  owasp?: string | string[];
  references?: string[];
  confidence?: string;
  [key: string]: unknown;
}

export interface SemgrepResult {
  check_id: string;
  path: string;
  start: SemgrepPosition;
  end: SemgrepPosition;
  extra: {
    message: string;
    severity: "ERROR" | "WARNING" | "INFO" | string;
    metadata?: SemgrepMetadata;
    lines?: string;
  };
}

export interface SemgrepOutput {
  results: SemgrepResult[];
  errors?: unknown[];
  version?: string;
}
