import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiError, getCurrentUser, getGithubAppStatus, type GithubAppStatus } from "@/lib/api";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let githubStatus: GithubAppStatus = { configured: false, slug: null };
  try {
    githubStatus = await getGithubAppStatus();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // API unreachable — the shell still renders; individual pages show their own ErrorBanner.
  }

  // Middleware already redirects an unauthenticated visitor to /login before
  // this layout ever renders — a `null` here means a session cookie is
  // present but the API rejected it (expired/tampered), which the sidebar
  // shows as "signed out" rather than crashing the page.
  const user = await getCurrentUser().catch(() => null);

  return (
    <AppShell githubStatus={githubStatus} user={user}>
      {children}
    </AppShell>
  );
}
