export interface GitleaksFinding {
  RuleID: string;
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn?: number;
  EndColumn?: number;
  Line?: string;
  Match: string;
  Secret: string;
  File: string;
  SymlinkFile?: string;
  Commit?: string;
  Entropy?: number;
  Author?: string;
  Email?: string;
  Date?: string;
  Message?: string;
  Tags?: string[];
  Fingerprint?: string;
}

export type GitleaksOutput = GitleaksFinding[];
