"use client";

import {
  Activity,
  CalendarDays,
  FolderKanban,
  GraduationCap,
  Handshake,
  History,
  Settings2,
  UserSearch,
  UsersRound,
} from "lucide-react";
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
 * Horizontal, wrapping on wide screens and scrolling on a phone, so no door
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
  if (doors.length === 0) return null;
  return (
    <nav
      aria-label={ariaLabel}
      data-testid="organization-doors"
      className={cn(
        "-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] sm:flex-wrap",
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
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan",
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
