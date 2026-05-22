"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

// P1.2 (beta hardening): Discover/Search were empty dead-ends → replaced with
// the real Profile (work identity) and Journal (proof) surfaces.
const TABS = [
  { key: "overview", href: "/dashboard" },
  { key: "profile", href: "/dashboard/profile" },
  { key: "journal", href: "/dashboard/journal" },
  { key: "account", href: "/dashboard/account" },
] as const;

export function DashboardTabs({ className }: { className?: string }) {
  const t = useTranslations("auth.dashboard.tabs");
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard sections"
      className={cn("flex items-center gap-1", className)}
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-ink-700 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
