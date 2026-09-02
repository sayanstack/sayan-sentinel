"use client";

import { Fragment, useState } from "react";
import { scanRepository, type RepositorySummary } from "@/lib/api";

export function RepositoriesView({ repositories }: { repositories: RepositorySummary[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    Record<string, { kind: "success" | "error"; text: string }>
  >({});

  async function handleScan(id: string) {
    setPendingId(id);
    try {
      const result = await scanRepository(id);
      setMessages((prev) => ({
        ...prev,
        [id]: {
          kind: "success",
          text: `Scan enqueued (${result.scanId.slice(0, 8)}…) — check the Scans page shortly.`,
        },
      }));
    } catch (e) {
      setMessages((prev) => ({
        ...prev,
        [id]: { kind: "error", text: e instanceof Error ? e.message : "Failed to enqueue scan." },
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Repository</th>
            <th className="px-4 py-3 font-medium">Default branch</th>
            <th className="px-4 py-3 font-medium">Visibility</th>
            <th className="px-4 py-3 font-medium">Last ingested</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {repositories.map((repo) => {
            const message = messages[repo.id];
            return (
              <Fragment key={repo.id}>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-text">
                    {repo.owner}/{repo.name}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{repo.defaultBranch}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {repo.private ? "Private" : "Public"}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{repo.lastIngestedSha ?? "Never"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleScan(repo.id)}
                      disabled={pendingId === repo.id}
                      className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-surface-raised disabled:opacity-50"
                    >
                      {pendingId === repo.id ? "Enqueuing…" : "Scan now"}
                    </button>
                  </td>
                </tr>
                {message && (
                  <tr className="border-t border-border bg-surface/50">
                    <td
                      colSpan={5}
                      className={`px-4 py-2 text-xs ${
                        message.kind === "success" ? "text-severity-low" : "text-severity-high"
                      }`}
                    >
                      {message.text}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
