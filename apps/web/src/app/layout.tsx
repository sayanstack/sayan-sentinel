import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ApiError, getGithubAppStatus, type GithubAppStatus } from "@/lib/api";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sayan Sentinel",
  description: "AI-native application security and code intelligence platform.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let githubStatus: GithubAppStatus = { configured: false, slug: null };
  try {
    githubStatus = await getGithubAppStatus();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // API unreachable — the shell still renders; individual pages show their own ErrorBanner.
  }

  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell githubStatus={githubStatus}>{children}</AppShell>
      </body>
    </html>
  );
}
