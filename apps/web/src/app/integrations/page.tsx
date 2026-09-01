import { headers } from "next/headers";
import { ErrorBanner } from "@/components/error-banner";
import { API_URL, ApiError, getGithubAppStatus } from "@/lib/api";
import { buildGithubAppManifest } from "@/lib/github-app-manifest";

async function currentOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function IntegrationsPage() {
  let status;
  let error: string | null = null;

  try {
    status = await getGithubAppStatus();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Integrations</h1>
        <p className="mt-1 text-text-muted">
          GitHub App, AI provider, and dynamic validation connection status.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load integration status" message={error} />}

      {status && (
        <section className="space-y-3 rounded-lg border border-border bg-surface p-6">
          <h2 className="text-lg font-medium text-text">GitHub</h2>
          {status.configured ? (
            <ConfiguredGithub slug={status.slug} />
          ) : (
            <UnconfiguredGithub appOrigin={await currentOrigin()} apiOrigin={API_URL} />
          )}
        </section>
      )}
    </div>
  );
}

function ConfiguredGithub({ slug }: { slug: string | null }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        The Sentinel GitHub App is configured on this deployment.
      </p>
      {slug ? (
        <a
          href={`https://github.com/apps/${slug}/installations/new`}
          className="inline-block rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue px-5 py-2.5 text-sm font-semibold text-bg shadow-[0_0_25px_-5px_rgba(34,211,238,0.6)] transition hover:shadow-[0_0_35px_-5px_rgba(34,211,238,0.8)]"
        >
          Install Sentinel on GitHub
        </a>
      ) : (
        <p className="text-sm text-severity-medium">
          Configured, but no <code>GITHUB_APP_SLUG</code> is set — add it so a real install link can
          be shown here.
        </p>
      )}
    </div>
  );
}

function UnconfiguredGithub({ appOrigin, apiOrigin }: { appOrigin: string; apiOrigin: string }) {
  const manifest = buildGithubAppManifest({ appOrigin, apiOrigin });

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        No GitHub App is set up on this deployment yet. Clicking below takes you to GitHub with
        everything (permissions, webhook URL, events) pre-filled — review it and click{" "}
        <span className="text-text">Create GitHub App</span> to finish. It&apos;s created under your
        personal GitHub account; transfer it to an organization afterward from the App&apos;s own
        settings if you&apos;d rather it live there.
      </p>
      <form method="post" action="https://github.com/settings/apps/new" target="_blank">
        <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-accent-cyan to-accent-blue px-5 py-2.5 text-sm font-semibold text-bg shadow-[0_0_25px_-5px_rgba(34,211,238,0.6)] transition hover:shadow-[0_0_35px_-5px_rgba(34,211,238,0.8)]"
        >
          Set up the Sentinel GitHub App
        </button>
      </form>
      <p className="text-xs text-text-muted">
        Opens github.com in a new tab. After you approve it, you&apos;ll land back here with the new
        App&apos;s credentials to copy into this deployment&apos;s environment variables.
      </p>
    </div>
  );
}
