import { ErrorBanner } from "@/components/error-banner";
import { TargetsView } from "@/components/targets-view";
import { ApiError, listOrganizations, listTargets } from "@/lib/api";

export default async function TargetsPage() {
  let targets;
  let organizations;
  let error: string | null = null;

  try {
    [targets, organizations] = await Promise.all([listTargets(), listOrganizations()]);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Web Targets</h1>
        <p className="mt-1 text-text-muted">
          Authorized web targets for the Web Security Engine and dynamic validation. A URL appearing
          anywhere in source, a README, or scanner output never authorizes Sentinel to scan it —
          only a verified target here does.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load targets" message={error} />}

      {!error && <TargetsView initialTargets={targets ?? []} organizations={organizations ?? []} />}
    </div>
  );
}
