"use client";

import {
  Activity,
  CalendarDays,
  FolderKanban,
  GraduationCap,
  Handshake,
  History,
  Settings2,
  Store,
  UserSearch,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { NavLinkPending } from "@/components/app/nav-link-pending";
import type { OrganizationDoorId } from "@/lib/company/organization-doors";
import { cn } from "@/lib/utils";

/**
 * ORGANIZATION DOORS — the persistent navigation of the organization
 * context (owner IA correction 2026-09-16, design/final/03 §2).
 *
 * A strip of DOORS, not a card grid and not a sidebar: each item is one
 * real-world context of running a labour operation (now · people · work ·
 * needs · calendar · partners · learning · history · settings), leads to the
 * ONE canonical surface for it, and is labelled in words — the icon only
 * makes the door recognisable at a glance. Which doors exist is decided
 * server-side (`loadOrganizationDoors`) from what the organization IS; this
 * component renders the list it is handed and highlights the active one.
 *
 * Horizontal and WRAPPING at every width (owner order 2026-10-25: no
 * sideways-scrolling navigation strips — the phone used to scroll), so no door
 * is ever hidden behind a menu (constitution §13).
 */
export type OrganizationDoorItem = {
  readonly id: OrganizationDoorId;
  readonly href: string;
  readonly label: string;
};

const ICONS: Record<
  OrganizationDoorId,
  React.ComponentType<{ className?: string }>
> = {
  now: Activity,
  people: UsersRound,
  work: FolderKanban,
  needs: UserSearch,
  market: Store,
  calendar: CalendarDays,
  partners: Handshake,
  education: GraduationCap,
  history: History,
  settings: Settings2,
};

function isActive(
  pathname: string,
  href: string,
  id: OrganizationDoorId,
): boolean {
  if (id === "now") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OrganizationDoors({
  doors,
  ariaLabel,
  className,
}: {
  doors: readonly OrganizationDoorItem[];
  ariaLabel: string;
  className?: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // On a phone the doors are one row that scrolls sideways; the current door
  // is brought into it without moving the page.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = Math.max(0, current.offsetLeft - nav.offsetLeft - 16);
  }, [pathname]);
  if (doors.length === 0) return null;
  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      data-testid="organization-doors"
      className={cn(
        // PHONE: one row of door cards that scrolls sideways with snap, the
        // next door showing at the edge (owner orders 2026-11-21/22 via the
        // coordinator, 2026-11-22: 8–9 doors had wrapped into three or four
        // rows, 150–200 px above every organisation page — UX gap SH-6). It
        // replaces the 2026-10-25 "wrap, never scroll" rule for this strip.
        // From `sm` the doors wrap as before.
        "flex gap-1.5 pb-1 max-sm:snap-x max-sm:snap-mandatory max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:scroll-px-4 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden sm:flex-wrap",
        className,
      )}
    >
      {doors.map((door) => {
        const Icon = ICONS[door.id];
        const active = isActive(pathname, door.href, door.id);
        return (
          <Link
            key={door.id}
            href={door.href as "/dashboard"}
            aria-current={active ? "page" : undefined}
            data-testid={`organization-door-${door.id}`}
            className={cn(
              "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-control border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan",
              active
                ? "border-brand-orange/60 bg-brand-orange/10 text-text-primary"
                : "border-ink-600 bg-ink-800/40 text-text-secondary hover:border-brand-blue hover:text-text-primary",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{door.label}</span>
            <NavLinkPending />
          </Link>
        );
      })}
    </nav>
  );
}
