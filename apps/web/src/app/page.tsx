import { ErrorBanner } from "@/components/error-banner";
import { StatCard } from "@/components/stat-card";
import { ApiError, getDashboardSummary, type Severity } from "@/lib/api";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export default async function OverviewPage() {
  let summary;
  let error: string | null = null;

  try {
    summary = await getDashboardSummary();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text">Overview</h1>
        <p className="mt-1 text-text-muted">Your organizations&apos; current security posture.</p>
      </header>

      {error && <ErrorBanner title="Couldn't load dashboard data" message={error} />}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Sentinel Security Score" value={summary.securityScore} accent="cyan" />
            <StatCard label="Repositories" value={summary.repositoryCount} />
            <StatCard label="Scans" value={summary.scanCount} />
            <StatCard label="Open Findings" value={summary.openFindingCount} />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-medium text-text">Open findings by severity</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {SEVERITIES.map((severity) => (
                <div key={severity} className="rounded-lg border border-border bg-surface p-4">
                  <div className="text-xs tracking-wide text-text-muted uppercase">{severity}</div>
                  <div className="mt-1 text-2xl font-semibold text-text">
                    {summary.openFindingsBySeverity[severity]}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {summary.repositoryCount === 0 && (
            <div className="rounded-lg border border-border bg-surface p-8 text-center">
              <p className="text-text">No repositories connected yet.</p>
              <p className="mt-1 text-sm text-text-muted">
                Install the Sentinel GitHub App on a repository to get started — see
                docs/github-app.md.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
