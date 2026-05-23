"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";

/**
 * Tablet / desktop horizontal tab bar. Tabs are sourced from
 * `lib/config/navigation.ts` (which itself derives from the
 * feature-availability catalogue). Adding / removing a tab is a
 * catalogue + meta change — never a component edit. The component is a
 * thin renderer.
 */
export function DashboardTabs({ className }: { className?: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <nav
      aria-label="Dashboard sections"
      className={cn("flex items-center gap-1", className)}
    >
      {VISIBLE_PRIMARY_NAV_ITEMS.map(({ id, href, tabLabelKey }) => {
        const active =
          href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={id}
            href={href as "/dashboard"}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-ink-700 text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t(tabLabelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
