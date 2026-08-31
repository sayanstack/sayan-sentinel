import { computeFingerprint, type FindingDraft } from "@sayan-sentinel/findings";
import type { Severity } from "@sayan-sentinel/shared";
import type { OsvOutput, OsvPackageResult, OsvSourceResult, OsvVulnerability } from "./types";

const SEVERITY_MAP: Record<string, Severity> = {
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "medium",
  MEDIUM: "medium",
  LOW: "low",
};

/**
 * OSV advisories don't always carry a normalized severity string — prefer
 * `database_specific.severity` (GHSA advisories set this) and fall back
 * to a conservative "medium" rather than attempting full CVSS-vector
 * parsing, which is easy to get subtly wrong.
 */
function resolveSeverity(vuln: OsvVulnerability): Severity {
  const declared =
    vuln.database_specific?.severity ??
    vuln.affected?.find((a) => a.database_specific?.severity)?.database_specific?.severity;

  if (typeof declared === "string") {
    const mapped = SEVERITY_MAP[declared.toUpperCase()];
    if (mapped) return mapped;
  }
  return "medium";
}

function resolveFixedVersion(vuln: OsvVulnerability): string | undefined {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      const fixedEvent = range.events.find((e) => e.fixed);
      if (fixedEvent?.fixed) return fixedEvent.fixed;
    }
  }
  return undefined;
}

function toFindingDraft(
  source: OsvSourceResult,
  pkg: OsvPackageResult,
  vuln: OsvVulnerability,
): FindingDraft {
  const fixedVersion = resolveFixedVersion(vuln);
  const packageLabel = `${pkg.package.name}@${pkg.package.version}`;

  const fingerprint = computeFingerprint({
    source: "dependency_analysis",
    category: vuln.id,
    filePath: source.source.path,
    symbol: `${pkg.package.ecosystem}:${pkg.package.name}`,
  });

  return {
    fingerprint,
    category: vuln.id,
    title: vuln.summary || vuln.id,
    description: vuln.details || vuln.summary || `${packageLabel} is affected by ${vuln.id}.`,
    severity: resolveSeverity(vuln),
    // A known-CVE-affects-known-version-range match is a database lookup,
    // not a heuristic guess — confirmed confidence is appropriate here in
    // a way it isn't for static-analysis pattern matches.
    confidence: "confirmed",
    primarySource: "dependency_analysis",
    filePath: source.source.path,
    symbol: packageLabel,
    remediation: fixedVersion
      ? `Upgrade ${pkg.package.name} to ${fixedVersion} or later.`
      : undefined,
    evidence: [
      {
        source: "dependency_analysis",
        scanner: "osv-scanner",
        detail: {
          vulnerabilityId: vuln.id,
          aliases: vuln.aliases,
          ecosystem: pkg.package.ecosystem,
          package: pkg.package.name,
          installedVersion: pkg.package.version,
          fixedVersion,
        },
      },
    ],
  };
}

export function normalizeOsvOutput(output: OsvOutput): FindingDraft[] {
  const drafts: FindingDraft[] = [];
  for (const source of output.results) {
    for (const pkg of source.packages) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        drafts.push(toFindingDraft(source, pkg, vuln));
      }
    }
  }
  return drafts;
}
