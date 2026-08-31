"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/repositories", label: "Repositories" },
  { href: "/scans", label: "Scans" },
  { href: "/findings", label: "Findings" },
  { href: "/code-graph", label: "Code Graph" },
  { href: "/pull-requests", label: "Pull Requests" },
  { href: "/policies", label: "Policies" },
  { href: "/integrations", label: "Integrations" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface px-4 py-6">
      <div className="mb-8 px-2">
        <div className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-lg font-semibold text-transparent">
          Sayan Sentinel
        </div>
        <div className="text-xs text-text-muted">by Sayan Stack</div>
      </div>
      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm transition-colors ${
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
