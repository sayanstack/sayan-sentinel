"use client";

import { useState, type FormEvent } from "react";
import {
  quickStartTarget,
  scanTarget,
  verifyTarget,
  type ProviderDetection,
  type QuickScanResult,
  type TargetAuthorizationSummary,
} from "@/lib/api";

type Step = "input" | "creating" | "verify" | "verifying" | "scanning" | "done";

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-severity-critical/50 bg-severity-critical/5",
  high: "border-severity-high/50 bg-severity-high/5",
  medium: "border-severity-medium/50 bg-severity-medium/5",
  low: "border-severity-low/50 bg-severity-low/5",
  info: "border-severity-info/50 bg-severity-info/5",
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: "text-severity-critical",
  high: "text-severity-high",
  medium: "text-severity-medium",
  low: "text-severity-low",
  info: "text-severity-info",
};

export function DomainOnboarding({
  onCreated,
  onVerified,
}: {
  onCreated: (target: TargetAuthorizationSummary) => void;
  onVerified: (target: TargetAuthorizationSummary) => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [host, setHost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<TargetAuthorizationSummary | null>(null);
  const [detection, setDetection] = useState<ProviderDetection | null>(null);
  const [verifyDetail, setVerifyDetail] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<QuickScanResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!host.trim()) return;
    setStep("creating");
    setError(null);
    try {
      const result = await quickStartTarget(host);
      setTarget(result.target);
      setDetection(result.detection);
      onCreated(result.target);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a target for that domain.");
      setStep("input");
    }
  }

  async function handleVerify() {
    if (!target) return;
    setStep("verifying");
    setVerifyDetail(null);
    setError(null);
    try {
      const verifyResult = await verifyTarget(target.id);
      onVerified(verifyResult);
      setTarget(verifyResult);

      if (!verifyResult.verificationOutcome.verified) {
        setVerifyDetail(verifyResult.verificationOutcome.detail);
        setStep("verify");
        return;
      }

      setStep("scanning");
      try {
        setScanResult(await scanTarget(target.id));
      } catch (scanErr) {
        setError(
          scanErr instanceof Error ? scanErr.message : "Verified, but the scan failed to run.",
        );
      }
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify target.");
      setStep("verify");
    }
  }

  function reset() {
    setStep("input");
    setHost("");
    setTarget(null);
    setDetection(null);
    setVerifyDetail(null);
    setScanResult(null);
    setError(null);
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the value is still visible to select by hand.
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/60 p-8 shadow-[0_0_80px_-20px_rgba(34,211,238,0.25)] backdrop-blur-sm md:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-accent-cyan/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <h1 className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-3xl font-semibold tracking-tight text-transparent md:text-5xl">
          Scan any website in minutes
        </h1>
        <p className="mt-3 text-text-muted md:text-lg">
          Type a domain. Sentinel detects how it&apos;s hosted, walks you through proving you own
          it, and runs its first passive scan the moment ownership is verified.
        </p>
      </div>

      <div className="relative mx-auto mt-8 max-w-2xl">
        {step === "input" && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-raised p-2 focus-within:ring-2 focus-within:ring-accent-cyan sm:flex-row sm:items-center">
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="example.com"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent px-3 py-3 text-lg text-text placeholder:text-text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={!host.trim()}
                className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue px-6 py-3 text-sm font-semibold text-bg shadow-[0_0_25px_-5px_rgba(34,211,238,0.6)] transition hover:shadow-[0_0_35px_-5px_rgba(34,211,238,0.8)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                Start Scan
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-border px-3 py-1">
                No https:// needed — Sentinel tries both
              </span>
              <a
                href="/integrations"
                className="rounded-full border border-border px-3 py-1 transition hover:border-accent-cyan hover:text-text"
              >
                Prefer to connect a GitHub repo instead? →
              </a>
            </div>
            {error && <p className="text-center text-sm text-severity-high">{error}</p>}
          </form>
        )}

        {step === "creating" && <StatusLine text={`Detecting how ${host} is hosted…`} />}

        {(step === "verify" || step === "verifying") && target && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-6 text-left">
            <div>
              <p className="text-sm text-text-muted">Verify you own</p>
              <p className="text-lg font-medium text-text">
                {target.scheme}://{target.host}
              </p>
            </div>

            {detection && (
              <div className="flex flex-wrap gap-2 text-xs">
                {detection.nameserverProvider && (
                  <span className="rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-3 py-1 text-accent-cyan">
                    DNS via {detection.nameserverProvider}
                  </span>
                )}
                {detection.hostingProvider && (
                  <span className="rounded-full border border-accent-violet/40 bg-accent-violet/10 px-3 py-1 text-accent-violet">
                    Hosted on {detection.hostingProvider}
                  </span>
                )}
                {!detection.nameserverProvider && !detection.hostingProvider && (
                  <span className="rounded-full border border-border px-3 py-1 text-text-muted">
                    Couldn&apos;t auto-detect your DNS provider — the steps below work anywhere
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-xl bg-bg/60 p-4">
              <p className="text-sm text-text-muted">
                Add this DNS TXT record
                {detection?.nameserverProvider ? ` in ${detection.nameserverProvider}` : ""}:
              </p>
              <CopyRow
                label="Name"
                value={`_sentinel-verification.${target.host}`}
                onCopy={() => copy(`_sentinel-verification.${target.host}`, "name")}
                copied={copied === "name"}
              />
              <CopyRow
                label="Value"
                value={`sentinel-verification=${target.verificationChallenge}`}
                onCopy={() =>
                  copy(`sentinel-verification=${target.verificationChallenge}`, "value")
                }
                copied={copied === "value"}
              />
            </div>

            {verifyDetail && <p className="text-sm text-severity-medium">{verifyDetail}</p>}
            {error && <p className="text-sm text-severity-high">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleVerify}
                disabled={step === "verifying"}
                className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue px-5 py-2.5 text-sm font-semibold text-bg shadow-[0_0_25px_-5px_rgba(34,211,238,0.6)] transition hover:shadow-[0_0_35px_-5px_rgba(34,211,238,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === "verifying" ? "Checking DNS…" : "I've added it — Verify now"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="text-sm text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-text-muted">
              DNS changes can take a few minutes to propagate — if verification doesn&apos;t succeed
              right away, wait a bit and try again.
            </p>
          </div>
        )}

        {step === "scanning" && (
          <StatusLine
            text={`Ownership verified. Running Sentinel's first pass on ${target?.host}…`}
          />
        )}

        {step === "done" && target && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-6 text-left">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-severity-low">✓</span>
              <p className="text-text">
                Ownership verified.{" "}
                {scanResult ? (
                  <>
                    Scanned <span className="font-mono text-sm">{scanResult.scannedUrl}</span> —{" "}
                    {scanResult.visitedCount} page(s) visited
                    {scanResult.truncated ? " (bounded scan, more pages may exist)" : ""}.
                  </>
                ) : (
                  "Scanning didn't complete — retry it from the table below once ready."
                )}
              </p>
            </div>

            {error && <p className="text-sm text-severity-high">{error}</p>}

            {scanResult?.fetchError && (
              <p className="text-sm text-severity-medium">
                Couldn&apos;t reach the site to scan it: {scanResult.fetchError}
              </p>
            )}

            {scanResult && scanResult.findings.length === 0 && !scanResult.fetchError && (
              <p className="text-sm text-text-muted">No issues found in this quick passive pass.</p>
            )}

            {scanResult && scanResult.findings.length > 0 && (
              <ul className="space-y-2">
                {scanResult.findings.map((finding, i) => (
                  <li
                    key={`${finding.ruleId}-${i}`}
                    className={`rounded-lg border p-3 ${SEVERITY_BORDER[finding.severity] ?? "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-text">{finding.title}</span>
                      <span
                        className={`text-xs font-semibold uppercase ${SEVERITY_TEXT[finding.severity] ?? "text-text-muted"}`}
                      >
                        {finding.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-muted">{finding.description}</p>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-text-muted">
              This is a live, unpersisted quick pass — it won&apos;t appear on the Findings
              dashboard. Connect a GitHub repository for full, persisted scan history.
            </p>

            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-border px-4 py-2 text-sm text-text hover:bg-surface"
            >
              Add another domain
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusLine({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-surface-raised p-6 text-text-muted">
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent-cyan" />
      {text}
    </div>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-text-muted">{label}</span>
      <code className="flex-1 overflow-x-auto rounded-md bg-surface px-2 py-1.5 text-xs text-text">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-text"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
