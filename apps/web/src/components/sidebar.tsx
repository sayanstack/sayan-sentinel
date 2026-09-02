"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CurrentUser } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/repositories", label: "Repositories" },
  { href: "/scans", label: "Scans" },
  { href: "/findings", label: "Findings" },
  { href: "/code-graph", label: "Code Graph" },
  { href: "/attack-surface", label: "Attack Surface" },
  { href: "/pull-requests", label: "Pull Requests" },
  { href: "/policies", label: "Policies" },
  { href: "/integrations", label: "Integrations" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export interface SidebarProps {
  /** Whether the off-canvas drawer is open on mobile — ignored at the `md` breakpoint and up, where the sidebar is always visible. */
  mobileOpen?: boolean;
  onNavigate?: () => void;
  user: CurrentUser | null;
}

export function Sidebar({ mobileOpen = false, onNavigate, user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-border bg-surface px-4 py-6 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="mb-8 px-2">
        <div className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-lg font-semibold text-transparent">
          Sayan Sentinel
        </div>
        <div className="text-xs text-text-muted">by Sayan Stack</div>
      </div>
      <nav aria-label="Primary" className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:outline-none ${
                active
                  ? "bg-surface-raised text-text"
                  : "text-text-muted hover:bg-surface-raised hover:text-text"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="absolute inset-x-4 bottom-6">
        {user ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2">
            {user.avatarUrl ? (
              // A plain <img> here (not next/image) — an external GitHub avatar URL isn't worth Next's optimization pipeline for a 32px sidebar thumbnail.
              <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-surface" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-text">
                {user.name ?? user.email}
              </div>
            </div>
            <form action="/logout" method="POST">
              <button
                type="submit"
                className="text-xs text-text-muted hover:text-text focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:outline-none"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <a
            href="/login"
            className="block rounded-md border border-border bg-surface-raised px-3 py-2 text-center text-xs text-text-muted hover:text-text"
          >
            Signed out — sign in
          </a>
        )}
      </div>
    </aside>
  );
}
