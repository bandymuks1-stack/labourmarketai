"use client";

import { FileText, Home, IdCard, Inbox, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import {
  VISIBLE_PRIMARY_NAV_ITEMS,
  type NavIconKey,
} from "@/lib/config/navigation";
import type { FeatureKey } from "@/lib/config/feature-availability";
import { cn } from "@/lib/utils";

// Tabs are sourced from `lib/config/navigation.ts`, which itself derives
// from the feature-availability catalogue. Adding / removing a tab is a
// catalogue + meta change — never a component edit.
//
// Icons live here because lucide is a presentation concern; the config
// only carries the icon ID.
const ICONS: Record<NavIconKey, LucideIcon> = {
  home: Home,
  idCard: IdCard,
  fileText: FileText,
  inbox: Inbox,
  user: User,
};

/** Mobile-only (<768px) bottom tab bar — the primary nav on phones, where
 *  the horizontal DashboardTabs would overflow. Tabs come from the
 *  catalogue (`lib/config/navigation.ts`). Hidden on tablet/desktop
 *  (`md:hidden`). Honours the iOS home-indicator inset via
 *  `env(safe-area-inset-bottom)`. */
export function BottomNav({
  badges,
}: {
  /** Per-feature unread/attention counts, e.g. { communication: 3 }. */
  badges?: Partial<Record<FeatureKey, number>>;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600/60 bg-ink-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {VISIBLE_PRIMARY_NAV_ITEMS.map(({ id, href, tabLabelKey, iconKey }) => {
          const Icon = ICONS[iconKey];
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(href + "/");
          const badge = badges?.[id] ?? 0;
          return (
            <li key={id} className="flex-1">
              <Link
                href={href as "/dashboard"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-tight transition-colors",
                  active
                    ? "text-brand-orange"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                <span className="relative">
                  <Icon aria-hidden className="h-5 w-5" strokeWidth={2} />
                  {badge > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[9px] font-bold leading-none text-white"
                      data-testid={`bottom-nav-badge-${id}`}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="leading-none">{t(tabLabelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
