import Link from "next/link";
import { ErrorBanner } from "@/components/error-banner";
import {
  ApiError,
  getRepositoryAttackSurface,
  listRepositories,
  type RepositoryAttackSurface,
} from "@/lib/api";

interface AttackSurfacePageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function AttackSurfacePage({ searchParams }: AttackSurfacePageProps) {
  const { repo: requestedRepositoryId } = await searchParams;

  let repositories;
  let error: string | null = null;
  try {
    repositories = await listRepositories();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  const selectedRepositoryId = requestedRepositoryId ?? repositories?.[0]?.id;

  let surface: RepositoryAttackSurface | null = null;
  if (!error && selectedRepositoryId) {
    try {
      surface = await getRepositoryAttackSurface(selectedRepositoryId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Attack Surface</h1>
        <p className="mt-1 text-text-muted">
          Pages, forms, and API routes discovered during the repository's most recent Full Stack
          Scan against a verified target, correlated against the routes extracted from source.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load the attack surface" message={error} />}

      {repositories && repositories.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No repositories connected yet.</p>
        </div>
      )}

      {repositories && repositories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {repositories.map((repo) => (
            <Link
              key={repo.id}
              href={`/attack-surface?repo=${repo.id}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                repo.id === selectedRepositoryId
                  ? "border-accent-cyan bg-surface-raised text-text"
                  : "border-border text-text-muted hover:bg-surface-raised hover:text-text"
              }`}
            >
              {repo.owner}/{repo.name}
            </Link>
          ))}
        </div>
      )}

      {surface && surface.scanId === null && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">This repository has no completed scan yet.</p>
        </div>
      )}

      {surface &&
        surface.scanId !== null &&
        surface.pages.length === 0 &&
        !surface.routeCorrelation && (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <p className="text-text">
              The most recent scan had no web target and no extractable source routes.
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Register and verify a Web Target for this repository, then re-scan, to populate the
              crawled attack surface.
            </p>
          </div>
        )}

      {surface && surface.scanId !== null && surface.pages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-text">Crawled pages ({surface.pages.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">Depth</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Links</th>
                  <th className="px-4 py-3 font-medium">Scripts</th>
                  <th className="px-4 py-3 font-medium">Forms</th>
                </tr>
              </thead>
              <tbody>
                {surface.pages.map((page) => (
                  <tr key={page.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-mono text-xs text-text">{page.url}</td>
                    <td className="px-4 py-3 text-text-muted">{page.depth}</td>
                    <td className="px-4 py-3 text-text-muted">{page.status}</td>
                    <td className="px-4 py-3 text-text-muted">{page.linkCount}</td>
                    <td className="px-4 py-3 text-text-muted">{page.scriptCount}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {page.forms.length === 0
                        ? "—"
                        : page.forms.map((form, i) => (
                            <div key={i} className="font-mono text-xs">
                              {form.method.toUpperCase()} {form.action ?? "(same page)"} —{" "}
                              {form.fieldNames.join(", ")}
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {surface && surface.routeCorrelation && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium text-text">Route correlation</h2>
          <div className="flex flex-wrap gap-3 text-sm text-text-muted">
            <span>{surface.routeCorrelation.runtimeRequestCount} runtime request(s) observed</span>
            <span>·</span>
            <span>{surface.routeCorrelation.matched.length} matched to source</span>
            <span>·</span>
            <span>
              {surface.routeCorrelation.unmatchedSourceRoutes.length} source route(s) never observed
              at runtime
            </span>
          </div>

          {surface.routeCorrelation.unmatchedSourceRoutes.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Unmatched source route</th>
                  </tr>
                </thead>
                <tbody>
                  {surface.routeCorrelation.unmatchedSourceRoutes.map((route, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs text-text">
                        {route.method} {route.pattern}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
