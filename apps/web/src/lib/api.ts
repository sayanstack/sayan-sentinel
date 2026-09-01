const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Placeholder identity until real session-based auth exists (see
 * docs/local-development.md / packages/auth's README) — matches the
 * `x-demo-user-id` header apps/api's endpoints currently read.
 */
const DEMO_USER_ID = "demo@sayansentinel.local";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  organizationId?: string;
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "x-demo-user-id": DEMO_USER_ID,
        ...(options.organizationId ? { "x-demo-organization-id": options.organizationId } : {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, `Could not reach the Sentinel API at ${API_URL}. Is it running?`);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(
      response.status,
      body.message ?? `Request to ${path} failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface DashboardSummary {
  repositoryCount: number;
  scanCount: number;
  securityScore: number;
  openFindingCount: number;
  openFindingsBySeverity: Record<Severity, number>;
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/dashboard/summary");
}

export interface RepositorySummary {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
  lastIngestedSha: string | null;
  updatedAt: string;
}

export function listRepositories(): Promise<RepositorySummary[]> {
  return apiFetch<RepositorySummary[]>("/repositories");
}

export type GraphNodeKind =
  | "file"
  | "function"
  | "class"
  | "method"
  | "route"
  | "external_module"
  | "env_var"
  | "external_endpoint"
  | "db_model"
  | "guard";

export interface GraphNodeSummary {
  id: string;
  externalId: string;
  kind: GraphNodeKind;
  filePath: string;
  name: string;
  lineStart: number;
  lineEnd: number;
}

export interface GraphEdgeSummary {
  id: string;
  kind: string;
  fromNodeExternalId: string;
  toNodeExternalId: string;
}

export interface RepositoryGraph {
  scanId: string | null;
  scanCreatedAt: string | null;
  nodes: GraphNodeSummary[];
  edges: GraphEdgeSummary[];
}

export function getRepositoryGraph(repositoryId: string): Promise<RepositoryGraph> {
  return apiFetch<RepositoryGraph>(`/repositories/${repositoryId}/graph`);
}

export interface AttackSurfaceForm {
  method: string;
  action?: string;
  fieldNames: string[];
}

export interface AttackSurfacePageSummary {
  id: string;
  url: string;
  depth: number;
  status: number;
  linkCount: number;
  scriptCount: number;
  forms: AttackSurfaceForm[];
}

export interface RouteCorrelationMatchSummary {
  runtimeMethod: string;
  runtimePath: string;
  sourceRoute: { method: string; pattern: string };
  params: Record<string, string>;
}

export interface RouteCorrelationSummary {
  runtimeRequestCount: number;
  matched: RouteCorrelationMatchSummary[];
  unmatchedRuntimeRequests: Array<{ method: string; path: string }>;
  unmatchedSourceRoutes: Array<{ method: string; pattern: string }>;
}

export interface RepositoryAttackSurface {
  scanId: string | null;
  scanCreatedAt: string | null;
  pages: AttackSurfacePageSummary[];
  routeCorrelation: RouteCorrelationSummary | null;
}

export function getRepositoryAttackSurface(repositoryId: string): Promise<RepositoryAttackSurface> {
  return apiFetch<RepositoryAttackSurface>(`/repositories/${repositoryId}/attack-surface`);
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export function listOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>("/organizations");
}

export type VerificationMethod = "DNS_TXT" | "HTTP_WELL_KNOWN";

export interface TargetAuthorizationSummary {
  id: string;
  organizationId: string;
  scheme: "http" | "https";
  host: string;
  port: number;
  allowedPathPrefixes: string[];
  verificationMethod: VerificationMethod;
  verificationChallenge: string | null;
  verifiedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
  maxTier: number;
  createdAt: string;
}

export interface CreateTargetInput {
  scheme: "http" | "https";
  host: string;
  port: number;
  verificationMethod: VerificationMethod;
  allowedPathPrefixes?: string[];
  expiresInDays?: number;
}

export function listTargets(): Promise<TargetAuthorizationSummary[]> {
  return apiFetch<TargetAuthorizationSummary[]>("/targets");
}

export function createTarget(
  organizationId: string,
  input: CreateTargetInput,
): Promise<TargetAuthorizationSummary> {
  return apiFetch<TargetAuthorizationSummary>("/targets", {
    method: "POST",
    body: input,
    organizationId,
  });
}

export interface VerifyTargetResult extends TargetAuthorizationSummary {
  verificationOutcome: { verified: boolean; method: string; detail: string };
}

export function verifyTarget(id: string): Promise<VerifyTargetResult> {
  return apiFetch<VerifyTargetResult>(`/targets/${id}/verify`, { method: "POST" });
}

export function revokeTarget(id: string): Promise<TargetAuthorizationSummary> {
  return apiFetch<TargetAuthorizationSummary>(`/targets/${id}/revoke`, { method: "POST" });
}

export interface ProviderDetection {
  host: string;
  resolvable: boolean;
  nameservers: string[];
  nameserverProvider: string | null;
  cname: string | null;
  hostingProvider: string | null;
  addresses: string[];
}

export interface QuickStartResult {
  target: TargetAuthorizationSummary;
  detection: ProviderDetection;
}

/** The one-field onboarding path — no organization picker, no scheme/port/method fields. */
export function quickStartTarget(host: string): Promise<QuickStartResult> {
  return apiFetch<QuickStartResult>("/targets/quick-start", { method: "POST", body: { host } });
}

export interface WebFindingEvidence {
  label: string;
  detail: string;
}

export interface QuickScanFinding {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  confidence: string;
  reason: string;
  url: string;
  evidence: WebFindingEvidence[];
  remediation: string;
}

export interface QuickScanResult {
  scannedUrl: string;
  schemeUsed: "http" | "https";
  visitedCount: number;
  truncated: boolean;
  findings: QuickScanFinding[];
  fetchError?: string;
}

/** Unpersisted, on-demand dynamic scan — see `runQuickScan` on the API for why this doesn't appear in the persisted Findings dashboard. */
export function scanTarget(id: string): Promise<QuickScanResult> {
  return apiFetch<QuickScanResult>(`/targets/${id}/scan`, { method: "POST" });
}

export type ScanTrigger = "MANUAL" | "PUSH" | "PULL_REQUEST" | "SCHEDULED";
export type ScanStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface ScanSummary {
  id: string;
  repositoryId: string;
  commitSha: string;
  trigger: ScanTrigger;
  status: ScanStatus;
  pullRequestNumber: number | null;
  durationMs: number | null;
  securityScore: number | null;
  createdAt: string;
  repository: { id: string; owner: string; name: string };
}

export function listScans(): Promise<ScanSummary[]> {
  return apiFetch<ScanSummary[]>("/scans");
}

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type FindingStatus =
  | "OPEN"
  | "CONFIRMED"
  | "LIKELY"
  | "NEEDS_REVIEW"
  | "FALSE_POSITIVE"
  | "RESOLVED"
  | "ACCEPTED_RISK";

export interface FindingSummary {
  id: string;
  category: string;
  title: string;
  severity: FindingSeverity;
  status: FindingStatus;
  filePath: string | null;
  lineStart: number | null;
  updatedAt: string;
  repository: { id: string; owner: string; name: string };
}

export function listFindings(): Promise<FindingSummary[]> {
  return apiFetch<FindingSummary[]>("/findings");
}
