"use client";

import { useState } from "react";
import {
  createTarget,
  revokeTarget,
  scanTarget,
  verifyTarget,
  type CreateTargetInput,
  type Organization,
  type QuickScanResult,
  type TargetAuthorizationSummary,
} from "@/lib/api";
import { DomainOnboarding } from "./domain-onboarding";

function verificationMethodLabel(method: TargetAuthorizationSummary["verificationMethod"]): string {
  if (method === "DNS_TXT") return "DNS TXT";
  if (method === "HTTP_WELL_KNOWN") return "HTTP well-known";
  return "HackerOne scope";
}

function statusLabel(target: TargetAuthorizationSummary): { label: string; className: string } {
  if (target.revokedAt) return { label: "Revoked", className: "text-text-muted" };
  if (new Date(target.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", className: "text-severity-high" };
  }
  if (target.verifiedAt) return { label: "Verified", className: "text-severity-low" };
  return { label: "Pending verification", className: "text-severity-medium" };
}

export function TargetsView({
  initialTargets,
  organizations,
}: {
  initialTargets: TargetAuthorizationSummary[];
  organizations: Organization[];
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<Record<string, QuickScanResult>>({});
  const [scanErrors, setScanErrors] = useState<Record<string, string>>({});

  function upsertTarget(target: TargetAuthorizationSummary) {
    setTargets((prev) => {
      const exists = prev.some((t) => t.id === target.id);
      return exists ? prev.map((t) => (t.id === target.id ? target : t)) : [target, ...prev];
    });
  }

  async function handleCreate(formData: FormData) {
    setSubmitting(true);
    setFormError(null);
    try {
      const organizationId = String(formData.get("organizationId") ?? "");
      const scheme = formData.get("scheme") === "http" ? "http" : "https";
      const host = String(formData.get("host") ?? "").trim();
      const port = Number(formData.get("port"));
      const verificationMethod =
        formData.get("verificationMethod") === "HTTP_WELL_KNOWN" ? "HTTP_WELL_KNOWN" : "DNS_TXT";

      if (!organizationId) throw new Error("Select an organization.");
      if (!host) throw new Error("Host is required.");
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("Port must be an integer between 1 and 65535.");
      }

      const input: CreateTargetInput = { scheme, host, port, verificationMethod };
      const created = await createTarget(organizationId, input);
      upsertTarget(created);
      setAdvancedOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to create target.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(id: string) {
    setPendingActionId(id);
    setActionError(null);
    setScanErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const result = await verifyTarget(id);
      upsertTarget(result);
      if (!result.verificationOutcome.verified) {
        setActionError(`Verification did not succeed: ${result.verificationOutcome.detail}`);
        return;
      }
      try {
        const scan = await scanTarget(id);
        setScanResults((prev) => ({ ...prev, [id]: scan }));
      } catch (scanErr) {
        setScanErrors((prev) => ({
          ...prev,
          [id]:
            scanErr instanceof Error ? scanErr.message : "Verified, but the scan failed to run.",
        }));
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to verify target.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this target authorization? This cannot be undone.")) return;
    setPendingActionId(id);
    setActionError(null);
    try {
      const updated = await revokeTarget(id);
      upsertTarget(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to revoke target.");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <DomainOnboarding onCreated={upsertTarget} onVerified={upsertTarget} />

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-sm text-text-muted hover:text-text"
        >
          {advancedOpen
            ? "Hide advanced setup"
            : "Advanced setup (custom port, HTTP, org picker) →"}
        </button>

        {advancedOpen && (
          <form
            action={handleCreate}
            className="mt-3 space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            {formError && <p className="text-sm text-severity-high">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-text-muted">
                Organization
                <select
                  name="organizationId"
                  required
                  defaultValue=""
                  className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-text-muted">
                Scheme
                <select
                  name="scheme"
                  defaultValue="https"
                  className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                >
                  <option value="https">https</option>
                  <option value="http">http</option>
                </select>
              </label>
              <label className="text-sm text-text-muted">
                Host
                <input
                  name="host"
                  required
                  placeholder="app.example.com"
                  className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                />
              </label>
              <label className="text-sm text-text-muted">
                Port
                <input
                  name="port"
                  type="number"
                  defaultValue={443}
                  required
                  className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                />
              </label>
              <label className="text-sm text-text-muted sm:col-span-2">
                Verification method
                <select
                  name="verificationMethod"
                  defaultValue="DNS_TXT"
                  className="mt-1 block w-full rounded-md border border-border bg-surface-raised px-2 py-1.5 text-text"
                >
                  <option value="DNS_TXT">DNS TXT record</option>
                  <option value="HTTP_WELL_KNOWN">HTTP well-known path</option>
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </form>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{targets.length} target(s)</p>
      </div>

      {actionError && <p className="text-sm text-severity-high">{actionError}</p>}

      {targets.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No web targets authorized yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Enter a domain above and prove ownership via a DNS TXT record before Sentinel will ever
            make a request to it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {targets.flatMap((target) => {
                const status = statusLabel(target);
                const isBusy = pendingActionId === target.id;
                const needsChallenge =
                  !target.verifiedAt && !target.revokedAt && target.verificationChallenge;
                const scanResult = scanResults[target.id];
                const scanError = scanErrors[target.id];
                const rows = [];

                rows.push(
                  <tr key={target.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text">
                      {target.scheme}://{target.host}:{target.port}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {verificationMethodLabel(target.verificationMethod)}
                    </td>
                    <td className={`px-4 py-3 font-medium ${status.className}`}>{status.label}</td>
                    <td className="px-4 py-3 text-text-muted">
                      {new Date(target.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {!target.revokedAt && (
                          <button
                            type="button"
                            onClick={() => handleVerify(target.id)}
                            disabled={isBusy}
                            className="rounded-md border border-border px-2 py-1 text-xs text-text hover:bg-surface-raised disabled:opacity-50"
                          >
                            {isBusy ? "…" : "Verify"}
                          </button>
                        )}
                        {!target.revokedAt && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(target.id)}
                            disabled={isBusy}
                            className="rounded-md border border-severity-high/40 px-2 py-1 text-xs text-severity-high hover:bg-severity-high/10 disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>,
                );

                if (needsChallenge) {
                  rows.push(
                    <tr
                      key={`${target.id}-challenge`}
                      className="border-t border-border bg-surface/50"
                    >
                      <td colSpan={5} className="px-4 py-3 text-xs text-text-muted">
                        {target.verificationMethod === "DNS_TXT" ? (
                          <>
                            Publish TXT{" "}
                            <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
                              _sentinel-verification.{target.host}
                            </code>{" "}
                            ={" "}
                            <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
                              sentinel-verification={target.verificationChallenge}
                            </code>
                          </>
                        ) : (
                          <>
                            Serve this value verbatim at{" "}
                            <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
                              {target.scheme}://{target.host}/.well-known/sentinel-verification
                            </code>
                            :{" "}
                            <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
                              {target.verificationChallenge}
                            </code>
                          </>
                        )}
                      </td>
                    </tr>,
                  );
                }

                if (scanError) {
                  rows.push(
                    <tr key={`${target.id}-scan-error`} className="border-t border-border">
                      <td colSpan={5} className="px-4 py-3 text-xs text-severity-medium">
                        Quick scan didn&apos;t complete: {scanError}
                      </td>
                    </tr>,
                  );
                }

                if (scanResult) {
                  rows.push(
                    <tr key={`${target.id}-scan`} className="border-t border-border bg-surface/50">
                      <td colSpan={5} className="px-4 py-3 text-xs text-text-muted">
                        <p>
                          Last quick scan: {scanResult.scannedUrl} — {scanResult.visitedCount}{" "}
                          page(s),{" "}
                          {scanResult.findings.length === 0
                            ? "no issues found"
                            : `${scanResult.findings.length} finding(s)`}
                          {scanResult.fetchError ? ` — ${scanResult.fetchError}` : ""}. Unpersisted
                          — not shown on the Findings dashboard.
                        </p>
                      </td>
                    </tr>,
                  );
                }

                return rows;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
