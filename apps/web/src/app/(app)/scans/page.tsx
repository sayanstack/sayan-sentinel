import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listScans, type ScanStatus } from "@/lib/api";

const STATUS_STYLES: Record<ScanStatus, string> = {
  QUEUED: "text-text-muted",
  RUNNING: "text-accent-blue",
  COMPLETED: "text-accent-cyan",
  FAILED: "text-red-400",
  CANCELLED: "text-text-muted",
};

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  return durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
}

export default async function ScansPage() {
  let scans;
  let error: string | null = null;

  try {
    scans = await listScans();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Scans</h1>
        <p className="mt-1 text-text-muted">
          Scan history, status, and duration across your repositories.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load scans" message={error} />}

      {scans && scans.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No scans yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            A scan is created automatically on push/PR (once the GitHub App and webhook are
            configured) or can be run manually against a registered repository.
          </p>
        </div>
      )}

      {scans && scans.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Commit</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id} className="border-t border-border">
                  <td className="px-4 py-3 text-text">
                    {scan.repository.owner}/{scan.repository.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {scan.commitSha.slice(0, 7)}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{scan.trigger}</td>
                  <td className={`px-4 py-3 font-medium ${STATUS_STYLES[scan.status]}`}>
                    {scan.status}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{scan.securityScore ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDuration(scan.durationMs)}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(scan.createdAt).toLocaleString()}
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
