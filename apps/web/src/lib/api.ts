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
