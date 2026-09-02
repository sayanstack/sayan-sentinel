import { ErrorBanner } from "@/components/error-banner";
import {
  ApiError,
  getAiUsage,
  getCurrentUser,
  getOrganization,
  listOrganizations,
  type AiUsageSummary,
  type OrganizationDetail,
} from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export default async function SettingsPage() {
  let error: string | null = null;
  let organization: OrganizationDetail | null = null;
  let aiUsage: AiUsageSummary | null = null;
  let userEmail: string | null = null;

  try {
    const [organizations, currentUser] = await Promise.all([listOrganizations(), getCurrentUser()]);
    userEmail = currentUser.email;
    const firstOrg = organizations[0];
    if (firstOrg) {
      [organization, aiUsage] = await Promise.all([
        getOrganization(firstOrg.id),
        getAiUsage(firstOrg.id),
      ]);
    }
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Settings</h1>
        <p className="mt-1 text-text-muted">Organization, members, and AI budget.</p>
      </header>

      {error && <ErrorBanner title="Couldn't load settings" message={error} />}

      {!error && !organization && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">You don&apos;t belong to an organization yet.</p>
        </div>
      )}

      {organization && (
        <>
          <section className="space-y-3 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-lg font-medium text-text">Organization</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Name</dt>
                <dd className="text-text">{organization.name}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Slug</dt>
                <dd className="text-text">{organization.slug}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Created</dt>
                <dd className="text-text">
                  {new Date(organization.createdAt).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-lg font-medium text-text">
              Members ({organization.members.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised text-text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {organization.members.map((member) => (
                    <tr key={member.userId} className="border-t border-border">
                      <td className="px-4 py-2 text-text">
                        {member.name ?? member.email}
                        {member.email === userEmail && (
                          <span className="ml-2 text-xs text-text-muted">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {ROLE_LABEL[member.role] ?? member.role}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-muted">
              No invite flow exists yet — a new member joins automatically by signing in with a
              GitHub account matching this organization&apos;s installed GitHub App, or by
              connecting the same organization&apos;s HackerOne program.
            </p>
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-surface p-6">
            <h2 className="text-lg font-medium text-text">AI budget</h2>
            {aiUsage && !aiUsage.enabled && (
              <p className="text-sm text-text-muted">
                No AI provider is configured on this deployment — AI-assisted analysis and its
                budget tracking are inactive.
              </p>
            )}
            {aiUsage && aiUsage.enabled && (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold text-text">
                    ${aiUsage.spentThisMonthUsd.toFixed(2)}
                  </span>
                  <span className="text-text-muted">
                    of ${aiUsage.monthlyBudgetUsd.toFixed(2)} spent this month
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-accent-blue"
                    style={{
                      width: `${
                        aiUsage.monthlyBudgetUsd > 0
                          ? Math.min(
                              100,
                              (aiUsage.spentThisMonthUsd / aiUsage.monthlyBudgetUsd) * 100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-xs text-text-muted">
                  Per-scan cap: ${aiUsage.perScanBudgetUsd.toFixed(2)}. Set via
                  AI_MONTHLY_BUDGET_USD / AI_PER_SCAN_BUDGET_USD — not adjustable from this page
                  yet.
                </p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
