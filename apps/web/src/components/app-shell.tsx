"use client";

import { useState, type ReactNode } from "react";
import type { GithubAppStatus } from "@/lib/api";
import { GithubConnectButton } from "./github-connect-button";
import { Sidebar } from "./sidebar";

export function AppShell({
  children,
  githubStatus,
}: {
  children: ReactNode;
  githubStatus: GithubAppStatus;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <span className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-base font-semibold text-transparent">
          Sayan Sentinel
        </span>
        <div className="flex items-center gap-2">
          <GithubConnectButton status={githubStatus} />
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="rounded-md p-2 text-text-muted hover:bg-surface-raised hover:text-text focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:outline-none"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      <GithubConnectButton
        status={githubStatus}
        className="fixed top-4 right-6 z-40 hidden md:inline-flex"
      />

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />

      <main className="flex-1 p-6 pt-20 md:p-8 md:pt-8">{children}</main>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 5h14M3 10h14M3 15h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
