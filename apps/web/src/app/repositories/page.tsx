import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listRepositories } from "@/lib/api";

export default async function RepositoriesPage() {
  let repositories;
  let error: string | null = null;

  try {
    repositories = await listRepositories();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Repositories</h1>
        <p className="mt-1 text-text-muted">Repositories connected via the Sentinel GitHub App.</p>
      </header>

      {error && <ErrorBanner title="Couldn't load repositories" message={error} />}

      {repositories && repositories.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No repositories connected yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Install the Sentinel GitHub App on a repository to get started — see docs/github-app.md.
          </p>
        </div>
      )}

      {repositories && repositories.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Repository</th>
                <th className="px-4 py-3 font-medium">Default branch</th>
                <th className="px-4 py-3 font-medium">Visibility</th>
                <th className="px-4 py-3 font-medium">Last ingested</th>
              </tr>
            </thead>
            <tbody>
              {repositories.map((repo) => (
                <tr key={repo.id} className="border-t border-border">
                  <td className="px-4 py-3 text-text">
                    {repo.owner}/{repo.name}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{repo.defaultBranch}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {repo.private ? "Private" : "Public"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{repo.lastIngestedSha ?? "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
