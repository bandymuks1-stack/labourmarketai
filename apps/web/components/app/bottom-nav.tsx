"use client";

import {
  CalendarDays,
  Home,
  IdCard,
  MapPin,
  MessageSquare,
  NotebookPen,
  Shield,
  Store,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import {
  getAdvancedNavItems,
  type NavIconKey,
} from "@/lib/config/navigation";
import type { FeatureKey } from "@/lib/config/feature-availability";
import { NavLinkPending } from "@/components/app/nav-link-pending";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

// Tabs are sourced from `lib/config/navigation.ts`, which itself derives
// from the feature-availability catalogue. Adding / removing a tab is a
// catalogue + meta change — never a component edit.
//
// Icons live here because lucide is a presentation concern; the config
// only carries the icon ID. ONE icon per destination across the whole app
// (audit PR8 icon rule): journal = NotebookPen, messages = MessageSquare,
// map = MapPin — the same icons the MyZone action grid uses, so the nav and
// the grid speak one visual language. FileText stays reserved for documents.
const ICONS: Record<NavIconKey, LucideIcon> = {
  home: Home,
  store: Store,
  map: MapPin,
  idCard: IdCard,
  journal: NotebookPen,
  messages: MessageSquare,
  calendar: CalendarDays,
  network: Users,
  user: User,
  shield: Shield,
};

/** Mobile-only (<768px) bottom tab bar — the primary nav on phones, where
 *  the horizontal DashboardTabs would overflow. Tabs come from the
 *  catalogue (`lib/config/navigation.ts`). Hidden on tablet/desktop
 *  (`md:hidden`). Honours the iOS home-indicator inset via
 *  `env(safe-area-inset-bottom)`. */
export function BottomNav({
  badges,
}: {
  /** Per-feature unread/attention counts, e.g. { communication: 3 }.
   *  When omitted, the counts come from the STREAMED notification spine
   *  via the auth context (P0 perf — badges hydrate after first paint). */
  badges?: Partial<Record<FeatureKey, number>>;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const { badges: spineBadges } = useAuth();
  badges = badges ?? (spineBadges as Partial<Record<FeatureKey, number>>);
  // Mobile bottom nav stays the focused catalogue-driven core — no Admin tab
  // here (it crowds the small bar). Admin remains reachable for admins via the
  // header account dropdown + the desktop tabs.
  //
  // Same de-duplication as the desktop tabs: Messages and Calendar are the
  // simple shell's persistent nav (they render in that chrome), so repeating
  // them here made the phone show two competing navigation systems. Both stay
  // deep-linkable and one keystroke away in the universal command search.
  const items = getAdvancedNavItems();

  return (
    <nav
      aria-label="Dashboard sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-600/60 bg-ink-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ id, href, tabLabelKey, iconKey }) => {
          const Icon = ICONS[iconKey];
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(href + "/");
          const badge = id === "admin" ? 0 : (badges?.[id] ?? 0);
          return (
            <li key={id} className="flex-1">
              <Link
                href={href as "/dashboard"}
                aria-current={active ? "page" : undefined}
                data-testid={`bottom-nav-${id}`}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-meta font-medium tracking-tight transition-colors",
                  active
                    ? "text-brand-orange"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
                {/* Selected-state bar (audit PR8): the active tab gets a real
                    indicator, not color alone — matches the desktop tab
                    treatment and survives color-vision differences. */}
                {active && (
                  <span
                    aria-hidden
                    data-testid="bottom-nav-active-indicator"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-b-full bg-brand-orange"
                  />
                )}
                <span className="relative">
                  <Icon aria-hidden className="h-5 w-5" strokeWidth={2} />
                  <NavLinkPending className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" />
                  {badge > 0 && (
                    <span
                      className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-meta font-bold leading-none text-white"
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
