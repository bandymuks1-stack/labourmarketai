"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, LayoutGrid, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import {
  getCoreNavItems,
  getHeaderOverflowNavItems,
  type NavItem,
} from "@/lib/config/navigation";
import { activeNavItem, headerPlaceLabelKey } from "@/lib/navigation/header-place";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { NavLinkPending } from "@/components/app/nav-link-pending";
import { cn } from "@/lib/utils";
import { useAuthOptional } from "@/lib/auth/context";
import { HeaderSearch } from "@/components/app/header-search";
import { NotificationPanel } from "@/components/app/notification-panel";
import { AccountMenu } from "@/components/app/account-menu";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { LmLogo } from "@/components/ui/lm-logo";
import { AnchoredOverlay } from "@/components/ui/anchored-overlay";
import { MobileSheet } from "@/components/ui/MobileSheet";
import { WorkspaceChip } from "./workspace-chip";
import { iconControl } from "./icon-scale";

export type ConversationNavLabels = {
  chat: string;
  journal: string;
  messages: string;
  calendar: string;
  profile: string;
};

/**
 * THE ONE TOP BAR (owner audit §4.4 + §13; ONE navigation system, owner order
 * 2026-10-25). Every authenticated surface renders THIS header — the
 * conversation home (`conversation-chat.tsx`), every `panel` route AND the
 * internal operator console (`DashboardChrome`). There is no second header, no
 * second tab row and no second workspace selector anywhere in the product.
 *
 *   identity  ← back-home (contextual workspaces only) · the LabourMarket logo,
 *             a LINK to the canonical home from every route (decision 0017)
 *   where     the ACTIVE WORKSPACE chip (the ONE workspace selector) · the
 *             place crumb for surfaces the nav does not name
 *   go        the core work loop (chat · journal · calendar · messages) by
 *             PRIORITY, then "More" for every other destination the person
 *             may open (map, network, the admin console for admins)
 *   utility   search · language · notifications · ONE avatar
 *
 * RESPONSIVE BY PRIORITY, NEVER BY SIDEWAYS SCROLLING (owner production
 * screenshot 2026-10-25: a scroll strip with a scrollbar, the workspace chip
 * laid over "Mano erdvė", the logo cut to "Labour…"). Nothing in this bar
 * scrolls or truncates a label:
 *   · from `md` one row. The active destination is a filled pill and, from
 *     `lg`, shows its label (that is "where am I"); the others are 44px icons
 *     with their label as the accessible name and tooltip, and show their
 *     label too once the bar is wide enough (≥1800px) for every locale's
 *     longest set. The place crumb joins at `2xl`, the wordmark at `xl`.
 *   · below `md` two rows: identity + utilities, then the workspace chip and
 *     ONE area button that names where the person is and opens every
 *     destination in a bottom sheet.
 * The workspace chip is the one element allowed to give width back — it
 * truncates a long organization name (full name in its tooltip) instead of
 * pushing anything else out of the row.
 */
export function ConversationHeader({
  title,
  nav,
  mobile = false,
}: {
  title: string;
  nav: ConversationNavLabels;
  /** Force the phone layout (used by the mobile design preview). */
  mobile?: boolean;
}) {
  const auth = useAuthOptional();
  const pathname = usePathname();
  const t = useTranslations();
  // Any simple-shell screen that is not the conversation itself is a
  // projection — it gets the one honest way back to the operating center.
  const isProjection = pathname !== "/dashboard";

  // THE NAV MODEL — one source (`lib/config/navigation.ts`), split by priority.
  // Admin is a permission dimension, not a catalogue feature: the admin
  // console joins "More" only for an admin who has not hidden admin chrome.
  const isAdmin = Boolean(auth?.isAdmin && !auth?.adminUiHidden);
  const primary = getCoreNavItems();
  const overflow = getHeaderOverflowNavItems({ isAdmin });
  const allItems = [...primary, ...overflow];
  const active = activeNavItem(pathname, allItems);
  const activeOverflow = active && overflow.some((i) => i.id === active.id) ? active : null;
  const placeKey = headerPlaceLabelKey(pathname, allItems);
  const place = placeKey ? t(placeKey) : null;
  const badges = auth?.badges ?? {};
  const badgeOf = (item: NavItem) => (item.id === "admin" ? 0 : (badges[item.id] ?? 0));

  return (
    <header
      data-testid="app-header"
      className={cn(
        "flex flex-none flex-wrap items-center gap-x-2 gap-y-2 border-b border-ink-600 bg-ink-900/80 px-4 py-2.5 backdrop-blur",
        !mobile && "md:flex-nowrap md:gap-x-3",
      )}
    >
      {/* IDENTITY — never shrinks, so the logo is never cut ("Labour…"). */}
      <span className={cn("order-1 flex flex-none items-center gap-2", !mobile && "md:order-none")}>
        {isProjection && (
          <Link
            href="/dashboard"
            aria-label={nav.chat}
            data-testid="back-to-chat"
            className="flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          >
            <ArrowLeft {...iconControl()} aria-hidden />
          </Link>
        )}
        {/* THE LOGO IS THE WAY HOME (owner decision 0017, 2026-09-22): from
            ANY authenticated route the LabourMarket mark leads to the
            canonical home — the conversation — for the current identity and
            context. Never the marketing landing, never a role-specific
            dashboard, never a nested surface. On the home itself it is a
            no-op link, not a dead span, so the affordance is the same
            everywhere. Pinned by lib/guards/logo-home-contract.test.ts. */}
        <Link
          href="/dashboard"
          data-testid="shell-logo-home"
          aria-label={title}
          className="flex flex-none items-center gap-2 rounded-sm outline-none ring-brand-blue focus-visible:ring-2"
        >
          {/* The canonical mark (owner §19) — never a letter standing in for
              it. Decorative: the Link's aria-label already names the product. */}
          <LmLogo title="" className="h-6 w-auto shrink-0" />
          <span className={`whitespace-nowrap font-display text-card-title font-bold tracking-tightest text-text-primary ${mobile ? "hidden" : "hidden xl:inline"}`}>{title}</span>
        </Link>
      </span>

      {/* WHERE — the ACTIVE WORKSPACE, always visible: the person must never
          guess which work context they are in. It is the ONE workspace
          selector of the product (the operator console's second, role-switcher
          copy of the same organization is gone). min-w-0 so the chip
          TRUNCATES on a narrow bar instead of ramming into its neighbours. */}
      {auth && (
        <span
          className={cn(
            "order-4 flex min-w-0 flex-1 items-center gap-1.5",
            !mobile && "md:order-none md:flex-initial",
          )}
        >
          <WorkspaceChip />
          {place && (
            <span
              data-testid="header-place"
              className={cn(
                "hidden flex-none items-center gap-1 text-support font-medium text-text-primary",
                !mobile && "2xl:flex",
              )}
            >
              <ChevronRight {...iconControl("text-text-muted")} aria-hidden />
              <span className="whitespace-nowrap">{place}</span>
            </span>
          )}
        </span>
      )}

      {/* GO — the core work loop by priority, then "More".

          WHY THE CORE LIVES IN THIS BAR, measured rather than argued. Decision
          0017 removed the four-tab row on the reasoning that every destination
          still had a command in the search and a chip in the conversation.
          Walked by a real person on production 2026-09-27, that reasoning did
          not hold: THE CALENDAR COULD NOT BE FOUND AT ALL. The only surfaces
          that rendered the catalogue (`DashboardTabs`, `BottomNav`) mounted
          ONLY in the admin console's chrome. This header is the universal bar
          — the chat renders it on the home and `DashboardChrome` renders it on
          every other route — so this is the ONE place the catalogue becomes
          navigation, for everyone, from `getCoreNavItems()` (the catalogue is
          the only source; this component never spells a destination itself). */}
      {auth && (
        <nav
          aria-label={t("common.dashboardSections")}
          data-testid="header-core-nav"
          className={cn("hidden flex-none items-center gap-1", !mobile && "md:mx-auto md:flex")}
        >
          {primary.map((item) => (
            <HeaderNavLink
              key={item.id}
              item={item}
              label={t(item.tabLabelKey)}
              active={active?.id === item.id}
              badge={badgeOf(item)}
              testId={`header-core-nav-${item.id}`}
            />
          ))}
          {overflow.length > 0 && (
            <HeaderMoreMenu
              items={overflow}
              activeItem={activeOverflow}
              label={t("common.nav.more")}
              labelOf={(item) => t(item.tabLabelKey)}
              badgeOf={badgeOf}
            />
          )}
        </nav>
      )}

      {/* Phone only: the row break before the workspace + area row. */}
      <span aria-hidden className={cn("order-3 h-0 basis-full", !mobile && "md:hidden")} />

      {/* Phone: ONE area button — names where the person is, opens every
          destination they may reach in a bottom sheet. */}
      {auth && (
        <HeaderAreaSheet
          className={cn("order-5 flex-none", !mobile && "md:hidden")}
          items={allItems}
          activeItem={active}
          place={place}
          labelOf={(item) => t(item.tabLabelKey)}
          badgeOf={badgeOf}
          menuLabel={t("common.nav.menu")}
          sheetTitle={t("common.nav.areas")}
          closeLabel={t("common.nav.close")}
          hereLabel={t("common.nav.youAreHere")}
        />
      )}

      {/* UTILITY — a shrink-0 anchor of 44px controls. */}
      <div className={cn("order-2 ml-auto flex flex-none items-center gap-1", !mobile && "md:order-none md:ml-0")}>
        {auth && (
          <HeaderSearch
            testId="chat-command-search"
            // Visible on EVERY width: search is one of the universal ways
            // (chat, search, the nav) to reach any projection.
            className="inline-flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
          />
        )}
        {/* Exactly ONE language control at every width: here from `md`, in
            the avatar menu below it (language-clarity.test.ts). On a
            width-starved bar it shows the locale CODE and grows to the native
            name once every label fits; its accessible name never shrinks. */}
        {auth && <LocaleSwitcher compactUntilWide className={mobile ? "hidden" : "hidden md:flex"} />}
        {auth && <NotificationPanel />}
        {/* THE one avatar. Profile, settings, theme, language, CV, the admin
            console (admins) and sign-out live inside the menu. */}
        {auth && <AccountMenu />}
      </div>
    </header>
  );
}

/** Label shown beside the icon on every item once the bar fits every locale. */
const WIDE_LABEL = "hidden min-[1800px]:inline";
/** The ACTIVE destination names itself as soon as the row has room for one
 *  label (`lg`); below that its filled pill is the "you are here" mark and the
 *  page title right under the bar names it. */
const ACTIVE_LABEL = "hidden lg:inline";

function NavBadge({ id, count }: { id: string; count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid={`header-nav-badge-${id}`}
      className="absolute -right-1.5 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-meta font-bold leading-none text-text-on-brand"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Shared look of every destination in the bar — one pill, one active state. */
function navPill(active: boolean): string {
  return cn(
    "relative flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-support font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-blue",
    active
      ? "bg-brand-blue/10 text-brand-blue ring-1 ring-inset ring-brand-blue/40"
      : "text-text-secondary hover:bg-ink-700/70 hover:text-text-primary",
  );
}

function HeaderNavLink({
  item,
  label,
  active,
  badge,
  testId,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  badge: number;
  testId: string;
}) {
  const Icon = NAV_ICONS[item.iconKey];
  return (
    <Link
      href={item.href as "/dashboard"}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={navPill(active)}
    >
      <span className="relative flex">
        <Icon {...iconControl()} aria-hidden />
        <NavBadge id={item.id} count={badge} />
      </span>
      {/* The ACTIVE destination always names itself — that is "where am I". */}
      <span className={active ? ACTIVE_LABEL : WIDE_LABEL}>{label}</span>
      <NavLinkPending />
    </Link>
  );
}

/**
 * "More" — every destination beyond the core loop, by priority. When the
 * person stands in one of them (the map, the network, the admin console) the
 * trigger itself takes that destination's icon, label and active state, so
 * the bar still says where they are without opening anything.
 */
function HeaderMoreMenu({
  items,
  activeItem,
  label,
  labelOf,
  badgeOf,
}: {
  items: readonly NavItem[];
  activeItem: NavItem | null;
  label: string;
  labelOf: (item: NavItem) => string;
  badgeOf: (item: NavItem) => number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const total = items.reduce((n, i) => n + badgeOf(i), 0);

  // A navigation closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Keyboard: the panel is portalled to <body>, so focus moves INTO it on
  // open and returns to the trigger on Escape / Tab-out.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const TriggerIcon = activeItem ? NAV_ICONS[activeItem.iconKey] : MoreHorizontal;
  const triggerLabel = activeItem ? labelOf(activeItem) : label;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="header-nav-more"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={activeItem ? `${triggerLabel} · ${label}` : label}
        aria-current={activeItem ? "page" : undefined}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={navPill(Boolean(activeItem))}
      >
        <span className="relative flex">
          <TriggerIcon {...iconControl()} aria-hidden />
          {!activeItem && <NavBadge id="more" count={total} />}
        </span>
        <span className={activeItem ? ACTIVE_LABEL : WIDE_LABEL}>{triggerLabel}</span>
        <ChevronDown
          {...iconControl(cn("hidden transition-transform duration-150 motion-reduce:transition-none lg:block", open && "rotate-180"))}
          aria-hidden
        />
      </button>
      <AnchoredOverlay anchorRef={triggerRef} open={open} onClose={() => setOpen(false)} align="left">
        <div
          ref={panelRef}
          data-testid="header-nav-more-menu"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
            if (e.key !== "Tab") return;
            const links = [...(panelRef.current?.querySelectorAll<HTMLElement>("a") ?? [])];
            const edge = e.shiftKey ? links[0] : links[links.length - 1];
            if (document.activeElement === edge) {
              e.preventDefault();
              close();
            }
          }}
          className="w-60 max-w-[calc(100vw-2rem)] rounded-md border border-ink-600 bg-ink-800 p-1.5 shadow-lg"
        >
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = NAV_ICONS[item.iconKey];
              const isActive = activeItem?.id === item.id;
              const badge = badgeOf(item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href as "/dashboard"}
                    aria-current={isActive ? "page" : undefined}
                    data-testid={`header-nav-more-${item.id}`}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded px-2.5 text-support outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
                      isActive
                        ? "bg-brand-blue/10 text-text-primary"
                        : "text-text-secondary hover:bg-ink-700 hover:text-text-primary",
                    )}
                  >
                    <Icon {...iconControl(isActive ? "text-brand-blue" : "")} aria-hidden />
                    <span className="flex-1">{labelOf(item)}</span>
                    {badge > 0 && (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-blue px-1 text-meta font-bold leading-none text-text-on-brand">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                    <NavLinkPending />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </AnchoredOverlay>
    </>
  );
}

/**
 * Phone: one button that NAMES where the person is (the place crumb, the
 * active destination, or "Menu") and opens every destination they may reach
 * in a bottom sheet — large tiles, the current one marked.
 */
function HeaderAreaSheet({
  className,
  items,
  activeItem,
  place,
  labelOf,
  badgeOf,
  menuLabel,
  sheetTitle,
  closeLabel,
  hereLabel,
}: {
  className?: string;
  items: readonly NavItem[];
  activeItem: NavItem | null;
  place: string | null;
  labelOf: (item: NavItem) => string;
  badgeOf: (item: NavItem) => number;
  menuLabel: string;
  sheetTitle: string;
  closeLabel: string;
  hereLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  const current = place ?? (activeItem ? labelOf(activeItem) : null);
  const Icon = !place && activeItem ? NAV_ICONS[activeItem.iconKey] : LayoutGrid;
  const total = items.reduce((n, i) => n + badgeOf(i), 0);
  return (
    <>
      <button
        type="button"
        data-testid="header-nav-sheet-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={current ? `${current} · ${menuLabel}` : menuLabel}
        onClick={() => setOpen(true)}
        className={cn(
          "relative flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-500 px-3 text-support font-medium text-text-primary transition-colors hover:border-brand-blue",
          className,
        )}
      >
        <Icon {...iconControl("text-brand-blue")} aria-hidden />
        <span>{current ?? menuLabel}</span>
        <ChevronDown {...iconControl("text-text-muted")} aria-hidden />
        <NavBadge id="sheet" count={total} />
      </button>
      <MobileSheet open={open} onClose={() => setOpen(false)} title={sheetTitle} closeLabel={closeLabel}>
        <ul data-testid="header-nav-sheet" className="grid grid-cols-2 gap-2 pb-2">
          {items.map((item) => {
            const ItemIcon = NAV_ICONS[item.iconKey];
            const isActive = activeItem?.id === item.id;
            const badge = badgeOf(item);
            return (
              <li key={item.id}>
                <Link
                  href={item.href as "/dashboard"}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`header-nav-sheet-${item.id}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "relative flex min-h-20 flex-col justify-between gap-2 rounded-lg border p-3 text-support font-medium transition-colors",
                    isActive
                      ? "border-brand-blue/60 bg-brand-blue/10 text-text-primary"
                      : "border-ink-600 bg-ink-800 text-text-secondary hover:border-ink-500 hover:text-text-primary",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <ItemIcon {...iconControl(isActive ? "text-brand-blue" : "")} aria-hidden />
                    {isActive ? (
                      <span className="text-meta font-semibold uppercase tracking-wide text-brand-blue">{hereLabel}</span>
                    ) : (
                      <NavBadge id={`sheet-${item.id}`} count={badge} />
                    )}
                  </span>
                  <span>{labelOf(item)}</span>
                  <NavLinkPending className="absolute bottom-3 right-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      </MobileSheet>
    </>
  );
}
