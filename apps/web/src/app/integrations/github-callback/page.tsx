import Link from "next/link";
import { CopyField } from "@/components/copy-field";

interface ManifestConversion {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
}

async function exchangeCode(code: string): Promise<ManifestConversion | null> {
  const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<ManifestConversion>;
}

export default async function GithubCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  if (!code) {
    return (
      <ErrorState message="No `code` was supplied — this page is only meant to be reached via GitHub's App-creation redirect." />
    );
  }

  const app = await exchangeCode(code);

  if (!app) {
    return (
      <ErrorState message="GitHub rejected the exchange — the code is one-time-use and expires quickly. Head back to Integrations and try creating the App again." />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">GitHub App created</h1>
        <p className="mt-1 text-text-muted">
          <span className="font-mono text-text">{app.slug}</span> exists now. Copy these six values
          into this deployment&apos;s environment variables, then redeploy — Sentinel reads them at
          startup, and none of this is shown again after you leave this page.
        </p>
      </header>

      <div className="space-y-4 rounded-lg border border-border bg-surface p-6">
        <CopyField label="GITHUB_APP_ID" value={String(app.id)} />
        <CopyField label="GITHUB_APP_SLUG" value={app.slug} />
        <CopyField label="GITHUB_APP_CLIENT_ID" value={app.client_id} />
        <CopyField label="GITHUB_APP_CLIENT_SECRET" value={app.client_secret} />
        <CopyField label="GITHUB_WEBHOOK_SECRET" value={app.webhook_secret} />
        <CopyField label="GITHUB_APP_PRIVATE_KEY" value={app.pem} multiline />
      </div>

      <p className="text-sm text-text-muted">
        After redeploying, go back to{" "}
        <Link href="/integrations" className="text-accent-cyan hover:underline">
          Integrations
        </Link>{" "}
        — Sentinel will show a real &quot;Install on GitHub&quot; button once it picks up these
        variables.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text">GitHub App setup</h1>
      <div className="rounded-lg border border-severity-high/40 bg-severity-high/5 p-6 text-sm text-severity-high">
        {message}
      </div>
      <Link href="/integrations" className="text-accent-cyan hover:underline">
        ← Back to Integrations
      </Link>
    </div>
  );
}
