import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listFindings, type FindingSeverity, type FindingStatus } from "@/lib/api";

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  CRITICAL: "text-red-400",
  HIGH: "text-orange-400",
  MEDIUM: "text-yellow-400",
  LOW: "text-accent-blue",
  INFO: "text-text-muted",
};

const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: "Open",
  CONFIRMED: "Confirmed",
  LIKELY: "Likely",
  NEEDS_REVIEW: "Needs review",
  FALSE_POSITIVE: "False positive",
  RESOLVED: "Resolved",
  ACCEPTED_RISK: "Accepted risk",
};

export default async function FindingsPage() {
  let findings;
  let error: string | null = null;

  try {
    findings = await listFindings();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Findings</h1>
        <p className="mt-1 text-text-muted">
          Correlated security findings across every connected repository.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load findings" message={error} />}

      {findings && findings.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No findings yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Findings appear here once a repository has been scanned at least once.
          </p>
        </div>
      )}

      {findings && findings.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Finding</th>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id} className="border-t border-border">
                  <td className={`px-4 py-3 font-medium ${SEVERITY_STYLES[finding.severity]}`}>
                    {finding.severity}
                  </td>
                  <td className="px-4 py-3 text-text">
                    <div>{finding.title}</div>
                    <div className="text-xs text-text-muted">{finding.category}</div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {finding.repository.owner}/{finding.repository.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {finding.filePath
                      ? `${finding.filePath}${finding.lineStart ? `:${finding.lineStart}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{STATUS_LABELS[finding.status]}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(finding.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
