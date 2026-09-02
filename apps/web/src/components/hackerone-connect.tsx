"use client";

import { useState } from "react";
import {
  connectHackerOne,
  disconnectHackerOne,
  listHackerOnePrograms,
  syncHackerOneScope,
  type HackerOneConnectionStatus,
  type HackerOneProgramSummary,
  type HackerOneSyncResult,
  type Organization,
} from "@/lib/api";

const SKIPPED_REASON_LABEL: Record<string, string> = {
  unsupported_asset_type: "not a web/URL asset Sentinel can scan",
  not_eligible_for_submission: "program marked this not eligible for submission",
  previously_revoked_by_user: "you revoked this target — not re-added automatically",
};

export function HackerOneConnect({
  organizations,
  initialStatus,
}: {
  organizations: Organization[];
  initialStatus: HackerOneConnectionStatus | null;
}) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [status, setStatus] = useState(initialStatus);
  const [identifier, setIdentifier] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [programs, setPrograms] = useState<HackerOneProgramSummary[]>([]);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<HackerOneSyncResult | null>(null);

  if (organizations.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        You need to belong to an organization before connecting HackerOne.
      </p>
    );
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await connectHackerOne(organizationId, identifier.trim(), tokenValue.trim());
      setPrograms(result.programs);
      setStatus({
        connected: true,
        apiTokenIdentifier: identifier.trim(),
        lastSyncedAt: null,
        lastSyncError: null,
        syncedPrograms: [],
      });
      setTokenValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify those credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function handleListPrograms() {
    setBusy(true);
    setError(null);
    try {
      const result = await listHackerOnePrograms(organizationId);
      setPrograms(result.programs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your HackerOne programs.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!selectedProgram) return;
    setBusy(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await syncHackerOneScope(organizationId, selectedProgram);
      setSyncResult(result);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              lastSyncedAt: new Date().toISOString(),
              lastSyncError: null,
              syncedPrograms: [
                ...prev.syncedPrograms.filter((p) => p.programHandle !== selectedProgram),
                {
                  programHandle: result.programHandle,
                  programName:
                    programs.find((p) => p.handle === result.programHandle)?.name ??
                    result.programHandle,
                  lastSyncedAt: new Date().toISOString(),
                },
              ],
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect HackerOne? Targets already synced stay in place.")) return;
    setBusy(true);
    setError(null);
    try {
      await disconnectHackerOne(organizationId);
      setStatus({
        connected: false,
        apiTokenIdentifier: null,
        lastSyncedAt: null,
        lastSyncError: null,
        syncedPrograms: [],
      });
      setPrograms([]);
      setSyncResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {organizations.length > 1 && (
        <label className="block text-sm text-text-muted">
          Organization
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-sm text-severity-high">{error}</p>}

      {!status?.connected ? (
        <form onSubmit={handleConnect} className="space-y-3">
          <p className="text-sm text-text-muted">
            HackerOne has no third-party sign-in — paste the API token you generate at{" "}
            <a
              href="https://hackerone.com/settings/api_token"
              target="_blank"
              rel="noreferrer"
              className="text-accent-cyan hover:underline"
            >
              hackerone.com/settings/api_token
            </a>
            . The identifier and value are used as Basic-Auth username/password — not your HackerOne
            login.
          </p>
          <label className="block text-sm text-text-muted">
            API token identifier
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
            />
          </label>
          <label className="block text-sm text-text-muted">
            API token value
            <input
              type="password"
              value={tokenValue}
              onChange={(e) => setTokenValue(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Connect HackerOne"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text">
            Connected as{" "}
            <code className="rounded bg-surface-raised px-1">{status.apiTokenIdentifier}</code>
          </p>

          {status.syncedPrograms.length > 0 && (
            <ul className="space-y-1 text-sm text-text-muted">
              {status.syncedPrograms.map((p) => (
                <li key={p.programHandle}>
                  {p.programName} ({p.programHandle}) — last synced{" "}
                  {new Date(p.lastSyncedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
          {status.lastSyncError && (
            <p className="text-sm text-severity-high">Last sync error: {status.lastSyncError}</p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={handleListPrograms}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm text-text hover:bg-surface-raised disabled:opacity-50"
            >
              {programs.length > 0 ? "Refresh programs" : "Load my programs"}
            </button>

            {programs.length > 0 && (
              <>
                <label className="text-sm text-text-muted">
                  Program
                  <select
                    value={selectedProgram}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                    className="mt-1 block rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                  >
                    <option value="">Select…</option>
                    {programs.map((p) => (
                      <option key={p.handle} value={p.handle}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleSync}
                  disabled={busy || !selectedProgram}
                  className="rounded-md bg-accent-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Syncing…" : "Sync scope"}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy}
              className="rounded-md border border-severity-high/40 px-3 py-2 text-sm text-severity-high hover:bg-severity-high/10 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>

          {syncResult && (
            <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm">
              <p className="text-text">
                {syncResult.created} target(s) created, {syncResult.updated} refreshed, out of{" "}
                {syncResult.totalScopeEntries} scope entries.
              </p>
              <p className="mt-2 text-xs text-text-muted">
                You&apos;re responsible for complying with this program&apos;s own policy —
                automated scanning may be restricted or rate-limited by rules HackerOne doesn&apos;t
                expose as structured data. Read the program&apos;s policy on HackerOne before
                scanning.
              </p>
              {syncResult.skipped.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-text-muted">
                    {syncResult.skipped.length} asset(s) skipped
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-text-muted">
                    {syncResult.skipped.map((s, i) => (
                      <li key={i}>
                        {s.assetType} — {s.assetIdentifier}:{" "}
                        {SKIPPED_REASON_LABEL[s.reason] ?? s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
