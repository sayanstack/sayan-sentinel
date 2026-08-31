export interface OsvPackageInfo {
  name: string;
  version: string;
  ecosystem: string;
}

export interface OsvSeverityEntry {
  type: string;
  score: string;
}

export interface OsvAffectedRangeEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

export interface OsvAffectedRange {
  type: string;
  events: OsvAffectedRangeEvent[];
}

export interface OsvAffected {
  ranges?: OsvAffectedRange[];
  database_specific?: { severity?: string; [key: string]: unknown };
}

export interface OsvVulnerability {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  severity?: OsvSeverityEntry[];
  affected?: OsvAffected[];
  database_specific?: { severity?: string; [key: string]: unknown };
  references?: Array<{ type: string; url: string }>;
}

export interface OsvPackageResult {
  package: OsvPackageInfo;
  vulnerabilities?: OsvVulnerability[];
  groups?: Array<{ ids: string[] }>;
}

export interface OsvSourceResult {
  source: { path: string; type: string };
  packages: OsvPackageResult[];
}

export interface OsvOutput {
  results: OsvSourceResult[];
}
