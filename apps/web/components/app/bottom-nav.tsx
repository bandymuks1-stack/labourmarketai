"use client";

import {
  CalendarDays,
  Globe,
  Home,
  IdCard,
  MapPin,
  MessageCircle,
  MessageSquare,
  NotebookPen,
  Shield,
  Store,
  Sun,
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

/** Icon ids for the worker's three tabs (ŠIANDIEN · PASAULIS · PAKLAUSK) —
 *  presentation-only, like the catalogue's keys; the tabs themselves are
 *  defined in `lib/today/today-route.ts`. */
export type WorkerNavIconKey = "today" | "world" | "ask";

const ICONS: Record<NavIconKey | WorkerNavIconKey, LucideIcon> = {
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
  today: Sun,
  world: Globe,
  ask: MessageCircle,
};

/**
 * An explicit tab, for a caller that composes its own bar on this primitive
 * (the worker's 3-tab bar, `components/app/today/worker-bottom-nav.tsx`).
 * Labels arrive already localized — a caller-composed bar never reaches
 * into the catalogue's `auth.dashboard.tabs.*` keys.
 */
export type BottomNavItemSpec = {
  readonly id: string;
  /** May carry a query string (`/dashboard?ask=1`); active state is then
   *  the caller's call (`activeId`), because two tabs can share a pathname. */
  readonly href: string;
  readonly label: string;
  readonly iconKey: NavIconKey | WorkerNavIconKey;
};

/** Mobile-only (<768px) bottom tab bar — the primary nav on phones, where
 *  the horizontal DashboardTabs would overflow. Tabs come from the
 *  catalogue (`lib/config/navigation.ts`) unless a caller passes its own
 *  `items` (the worker's 3-tab bar). Hidden on tablet/desktop
 *  (`md:hidden`) unless `visibility="all"`. Honours the iOS home-indicator
 *  inset via `env(safe-area-inset-bottom)`. */
export function BottomNav({
  badges,
  items: explicitItems,
  activeId,
  placement = "fixed",
  visibility = "mobile",
  ariaLabel = "Dashboard sections",
  testId,
}: {
  /** Per-feature unread/attention counts, e.g. { communication: 3 }.
   *  When omitted, the counts come from the STREAMED notification spine
   *  via the auth context (P0 perf — badges hydrate after first paint). */
  badges?: Partial<Record<FeatureKey, number>>;
  /** Caller-composed tabs (the worker bar). Omitted → the catalogue. */
  items?: readonly BottomNavItemSpec[];
  /** The active tab for caller-composed items (pathname alone cannot tell
   *  `/dashboard` from `/dashboard?ask=1`). Ignored for catalogue items. */
  activeId?: string | null;
  /** `fixed` rides the viewport bottom (routes with a scrolling main);
   *  `static` sits in normal flow — for a `h-[100dvh]` flex column such as
   *  the conversation, where a fixed bar would cover the composer. */
  placement?: "fixed" | "static";
  /** `mobile` = `md:hidden` (the catalogue bar); `all` = every width. */
  visibility?: "mobile" | "all";
  ariaLabel?: string;
  /** The nav landmark's own testid (the catalogue bar has none — its tabs
   *  carry `bottom-nav-<id>`). */
  testId?: string;
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
  const items: readonly BottomNavItemSpec[] =
    explicitItems ??
    getAdvancedNavItems().map(({ id, href, tabLabelKey, iconKey }) => ({
      id,
      href,
      label: t(tabLabelKey),
      iconKey,
    }));

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        // The catalogue bar's resting geometry (pinned by mobile-layout):
        // full-width, fixed to the viewport bottom, safe-area aware.
        placement === "fixed" ? "fixed inset-x-0 bottom-0" : "relative flex-none",
        "z-30 border-t border-ink-600/60 bg-ink-900/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]",
        visibility === "mobile" && "md:hidden",
      )}
    >
      <ul className="flex items-stretch justify-around">
        {items.map(({ id, href, label, iconKey }) => {
          const Icon = ICONS[iconKey];
          const active = explicitItems
            ? activeId === id
            : href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === href || pathname.startsWith(href + "/");
          const badge =
            explicitItems || id === "admin" ? 0 : (badges?.[id as FeatureKey] ?? 0);
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
                <span className="leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
