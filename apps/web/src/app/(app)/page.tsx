import { ErrorBanner } from "@/components/error-banner";
import { StatCard } from "@/components/stat-card";
import { TargetsView } from "@/components/targets-view";
import {
  ApiError,
  getDashboardSummary,
  listOrganizations,
  listTargets,
  type Severity,
} from "@/lib/api";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export default async function OverviewPage() {
  let summary;
  let targets;
  let organizations;
  let summaryError: string | null = null;
  let targetsError: string | null = null;

  try {
    summary = await getDashboardSummary();
  } catch (e) {
    summaryError = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  try {
    [targets, organizations] = await Promise.all([listTargets(), listOrganizations()]);
  } catch (e) {
    targetsError = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-10">
      {targetsError && <ErrorBanner title="Couldn't load targets" message={targetsError} />}
      {!targetsError && (
        <TargetsView initialTargets={targets ?? []} organizations={organizations ?? []} />
      )}

      <div className="space-y-6">
        <header>
          <h2 className="text-lg font-medium text-text">Security posture</h2>
          <p className="mt-1 text-sm text-text-muted">
            Your organizations&apos; current security posture.
          </p>
        </header>

        {summaryError && (
          <ErrorBanner title="Couldn't load dashboard data" message={summaryError} />
        )}

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Sentinel Security Score"
                value={summary.securityScore}
                accent="cyan"
              />
              <StatCard label="Repositories" value={summary.repositoryCount} />
              <StatCard label="Scans" value={summary.scanCount} />
              <StatCard label="Open Findings" value={summary.openFindingCount} />
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium text-text">Open findings by severity</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {SEVERITIES.map((severity) => (
                  <div key={severity} className="rounded-lg border border-border bg-surface p-4">
                    <div className="text-xs tracking-wide text-text-muted uppercase">
                      {severity}
                    </div>
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
                  Connect one from{" "}
                  <a href="/integrations" className="text-accent-cyan hover:underline">
                    Integrations
                  </a>{" "}
                  to get code scanning alongside web targets.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
