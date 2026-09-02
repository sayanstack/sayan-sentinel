import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listPolicies } from "@/lib/api";

const RULE_LABELS: Record<string, string> = {
  fail_on_severity: "Fail the scan if any finding at or above this severity exists",
  fail_on_confirmed_severity:
    "Fail the scan if a confirmed finding at or above this severity exists",
  block_new_secrets: "Block the scan if a new secret is detected",
  block_dependency_vulnerabilities:
    "Block the scan if a dependency vulnerability at or above this severity exists",
  require_review_for_sensitive_changes: "Require human review for changes in these categories",
};

export default async function PoliciesPage() {
  let policies;
  let error: string | null = null;

  try {
    policies = await listPolicies();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Policies</h1>
        <p className="mt-1 text-text-muted">
          The policy rules every scan is actually evaluated against today. There&apos;s no
          per-organization customization yet — this is the one global set, not a preview of
          something editable.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load policies" message={error} />}

      {policies && (
        <ul className="space-y-3">
          {policies.map((rule) => (
            <li key={rule.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="font-medium text-text">{rule.id}</span>
                <span
                  className={`text-xs font-semibold uppercase ${rule.enabled ? "text-severity-low" : "text-text-muted"}`}
                >
                  {rule.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {RULE_LABELS[rule.type] ?? rule.type}
                {rule.minSeverity ? ` (${rule.minSeverity}+)` : ""}
              </p>
              {rule.categories && rule.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rule.categories.map((category) => (
                    <span
                      key={category}
                      className="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
