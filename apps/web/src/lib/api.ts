import { readSessionToken } from "./session-cookie";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = await readSessionToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
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

/** Manually enqueues a Full Stack Scan of the repository's default-branch HEAD — the same pipeline a push/PR webhook triggers automatically. */
export function scanRepository(id: string): Promise<{ scanId: string }> {
  return apiFetch<{ scanId: string }>(`/repositories/${id}/scan`, { method: "POST" });
}

export interface GithubAppStatus {
  configured: boolean;
  slug: string | null;
}

export function getGithubAppStatus(): Promise<GithubAppStatus> {
  return apiFetch<GithubAppStatus>("/github/app-status");
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

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  joinedAt: string;
}

export interface OrganizationDetail extends Organization {
  createdAt: string;
  members: OrganizationMember[];
}

export function getOrganization(id: string): Promise<OrganizationDetail> {
  return apiFetch<OrganizationDetail>(`/organizations/${id}`);
}

export interface AiUsageSummary {
  enabled: boolean;
  monthlyBudgetUsd: number;
  perScanBudgetUsd: number;
  spentThisMonthUsd: number;
}

export function getAiUsage(organizationId: string): Promise<AiUsageSummary> {
  return apiFetch<AiUsageSummary>(`/organizations/${organizationId}/ai-usage`);
}

export type VerificationMethod = "DNS_TXT" | "HTTP_WELL_KNOWN" | "HACKERONE_SCOPE";

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
    body: { ...input, organizationId },
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

/** The Cloudflare-only "do it for me" DNS setup — the token is used once server-side and never stored. */
export function autoConfigureCloudflare(id: string, apiToken: string): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/targets/${id}/auto-configure/cloudflare`, {
    method: "POST",
    body: { apiToken },
  });
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

export interface ActivityEvent {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function listActivity(): Promise<ActivityEvent[]> {
  return apiFetch<ActivityEvent[]>("/activity");
}

export type PullRequestStatus = "OPEN" | "MERGED" | "CLOSED";

export interface PullRequestSummary {
  id: string;
  repositoryId: string;
  githubPrNumber: number;
  branchName: string;
  status: PullRequestStatus;
  createdAt: string;
  repository: { id: string; owner: string; name: string };
}

export function listPullRequests(): Promise<PullRequestSummary[]> {
  return apiFetch<PullRequestSummary[]>("/pull-requests");
}

export interface PolicyRule {
  id: string;
  enabled: boolean;
  type: string;
  minSeverity?: string;
  categories?: string[];
}

export function listPolicies(): Promise<PolicyRule[]> {
  return apiFetch<PolicyRule[]>("/policies");
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/auth/me");
}

export interface HackerOneProgramSummary {
  handle: string;
  name: string;
  submissionState: string | null;
  offersBounties: boolean;
}

export interface HackerOneConnectionStatus {
  connected: boolean;
  apiTokenIdentifier: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  syncedPrograms: Array<{ programHandle: string; programName: string; lastSyncedAt: string }>;
}

export interface HackerOneSkippedAsset {
  assetType: string;
  assetIdentifier: string;
  reason: "unsupported_asset_type" | "not_eligible_for_submission" | "previously_revoked_by_user";
}

export interface HackerOneSyncResult {
  programHandle: string;
  totalScopeEntries: number;
  created: number;
  updated: number;
  skipped: HackerOneSkippedAsset[];
}

export function getHackerOneStatus(organizationId: string): Promise<HackerOneConnectionStatus> {
  return apiFetch<HackerOneConnectionStatus>(
    `/hackerone/status?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export function connectHackerOne(
  organizationId: string,
  apiTokenIdentifier: string,
  apiTokenValue: string,
): Promise<{ programs: HackerOneProgramSummary[] }> {
  return apiFetch<{ programs: HackerOneProgramSummary[] }>("/hackerone/connect", {
    method: "POST",
    body: { organizationId, apiTokenIdentifier, apiTokenValue },
  });
}

export function listHackerOnePrograms(
  organizationId: string,
): Promise<{ programs: HackerOneProgramSummary[] }> {
  return apiFetch<{ programs: HackerOneProgramSummary[] }>(
    `/hackerone/programs?organizationId=${encodeURIComponent(organizationId)}`,
  );
}

export function syncHackerOneScope(
  organizationId: string,
  programHandle: string,
): Promise<HackerOneSyncResult> {
  return apiFetch<HackerOneSyncResult>("/hackerone/sync", {
    method: "POST",
    body: { organizationId, programHandle },
  });
}

export function disconnectHackerOne(organizationId: string): Promise<{ disconnected: boolean }> {
  return apiFetch<{ disconnected: boolean }>("/hackerone/disconnect", {
    method: "POST",
    body: { organizationId },
  });
}
