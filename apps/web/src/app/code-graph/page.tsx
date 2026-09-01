import Link from "next/link";
import { ErrorBanner } from "@/components/error-banner";
import {
  ApiError,
  getRepositoryGraph,
  listRepositories,
  type GraphNodeKind,
  type RepositoryGraph,
} from "@/lib/api";

const KIND_LABELS: Record<GraphNodeKind, string> = {
  file: "Files",
  function: "Functions",
  class: "Classes",
  method: "Methods",
  route: "Routes",
  external_module: "External modules",
  env_var: "Environment variables",
  external_endpoint: "External endpoints",
  db_model: "DB models",
  guard: "Guards",
};

interface CodeGraphPageProps {
  searchParams: Promise<{ repo?: string }>;
}

export default async function CodeGraphPage({ searchParams }: CodeGraphPageProps) {
  const { repo: requestedRepositoryId } = await searchParams;

  let repositories;
  let error: string | null = null;
  try {
    repositories = await listRepositories();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  const selectedRepositoryId = requestedRepositoryId ?? repositories?.[0]?.id;

  let graph: RepositoryGraph | null = null;
  if (!error && selectedRepositoryId) {
    try {
      graph = await getRepositoryGraph(selectedRepositoryId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
    }
  }

  const nodesByKind = new Map<GraphNodeKind, number>();
  for (const node of graph?.nodes ?? []) {
    nodesByKind.set(node.kind, (nodesByKind.get(node.kind) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Code Graph</h1>
        <p className="mt-1 text-text-muted">
          The real architecture graph (files, functions, routes, calls, data access) extracted by
          the Sentinel Rules Engine's AST parser during the repository's most recent completed scan
          — shown as filterable tables rather than an interactive canvas.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load the code graph" message={error} />}

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
              href={`/code-graph?repo=${repo.id}`}
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

      {graph && graph.scanId === null && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">This repository has no completed scan yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            The graph is extracted during a scan — nothing to show until one completes.
          </p>
        </div>
      )}

      {graph && graph.scanId !== null && (
        <>
          <div className="flex flex-wrap gap-3 text-sm text-text-muted">
            <span>
              {graph.nodes.length} node{graph.nodes.length === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>
              {graph.edges.length} edge{graph.edges.length === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>
              from scan at{" "}
              {graph.scanCreatedAt
                ? new Date(graph.scanCreatedAt).toLocaleString()
                : "unknown time"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {(Object.keys(KIND_LABELS) as GraphNodeKind[])
              .filter((kind) => (nodesByKind.get(kind) ?? 0) > 0)
              .map((kind) => (
                <div key={kind} className="rounded-lg border border-border bg-surface p-3">
                  <div className="text-lg font-semibold text-text">{nodesByKind.get(kind)}</div>
                  <div className="text-xs text-text-muted">{KIND_LABELS[kind]}</div>
                </div>
              ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.slice(0, 300).map((node) => (
                  <tr key={node.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text-muted">{node.kind}</td>
                    <td className="px-4 py-3 text-text">{node.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {node.filePath}:{node.lineStart}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {graph.nodes.length > 300 && (
              <p className="border-t border-border bg-surface px-4 py-2 text-xs text-text-muted">
                Showing the first 300 of {graph.nodes.length} nodes.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
