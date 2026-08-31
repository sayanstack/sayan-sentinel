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

async function apiFetch<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "x-demo-user-id": DEMO_USER_ID },
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
