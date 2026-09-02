import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listPullRequests } from "@/lib/api";

const STATUS_CLASS: Record<string, string> = {
  OPEN: "text-severity-low",
  MERGED: "text-accent-cyan",
  CLOSED: "text-text-muted",
};

export default async function PullRequestsPage() {
  let pullRequests;
  let error: string | null = null;

  try {
    pullRequests = await listPullRequests();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Pull Requests</h1>
        <p className="mt-1 text-text-muted">
          Remediation pull requests Sentinel has opened after an approved patch.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load pull requests" message={error} />}

      {pullRequests && pullRequests.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No pull requests yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Sentinel opens one automatically here once a generated patch for a finding is approved —
            requires a connected GitHub repository with the App installed.
          </p>
        </div>
      )}

      {pullRequests && pullRequests.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Pull Request</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {pullRequests.map((pr) => (
                <tr key={pr.id} className="border-t border-border">
                  <td className="px-4 py-3 text-text">
                    {pr.repository.owner}/{pr.repository.name}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`https://github.com/${pr.repository.owner}/${pr.repository.name}/pull/${pr.githubPrNumber}`}
                      className="text-accent-cyan hover:underline"
                    >
                      #{pr.githubPrNumber}
                    </a>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">{pr.branchName}</td>
                  <td className={`px-4 py-3 font-medium ${STATUS_CLASS[pr.status] ?? ""}`}>
                    {pr.status}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(pr.createdAt).toLocaleDateString()}
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
