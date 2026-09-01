"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/repositories", label: "Repositories" },
  { href: "/targets", label: "Web Targets" },
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
}

export function Sidebar({ mobileOpen = false, onNavigate }: SidebarProps) {
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
    </aside>
  );
}
