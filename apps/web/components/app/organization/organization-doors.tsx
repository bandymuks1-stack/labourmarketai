"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "@/lib/i18n/navigation";
import { CardRail, type RailCard } from "@/components/navigation/card-rail";
import type { OrganizationDoorId } from "@/lib/company/organization-doors";
import { ORGANIZATION_DOOR_ICONS } from "@/lib/navigation/nav-card-icons";

/**
 * ORGANIZATION DOORS — the persistent navigation of the organization
 * context (owner IA correction 2026-09-16, design/final/03 §2).
 *
 * Each door is one real-world context of running a labour operation (now ·
 * people · work · needs · market · calendar · partners · learning · history ·
 * settings), leads to the ONE canonical surface for it, and is labelled in
 * words — the icon only makes the door recognisable at a glance. Which doors
 * exist is decided server-side (`loadOrganizationDoors`) from what the
 * organization IS; this component renders the list it is handed and marks the
 * active one.
 *
 * Drawn on the ONE rail, `CardRail` (spec N7, Option A of
 * docs/design/CAROUSEL_NAVIGATION_SPEC.md §8.2): one row at every width that
 * snaps, the next door peeking and the dots under it on phones, arrows on wide
 * screens when the row overflows. No door is hidden behind a menu
 * (constitution §13). The current door is brought into view without moving
 * the page.
 */
export type OrganizationDoorItem = {
  readonly id: OrganizationDoorId;
  readonly href: string;
  readonly label: string;
};

function isActive(pathname: string, href: string, id: OrganizationDoorId): boolean {
  if (id === "now") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OrganizationDoors({
  doors,
  ariaLabel,
  swipeHint,
  prevLabel,
  nextLabel,
  className,
}: {
  doors: readonly OrganizationDoorItem[];
  ariaLabel: string;
  swipeHint: string;
  prevLabel: string;
  nextLabel: string;
  className?: string;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeId = doors.find((door) => isActive(pathname, door.href, door.id))?.id ?? null;
  useEffect(() => {
    const track = navRef.current?.querySelector<HTMLElement>('[data-rail-part="track"]');
    const current = track?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!track || !current || track.scrollWidth <= track.clientWidth) return;
    track.scrollLeft = Math.max(0, current.offsetLeft - track.offsetLeft - 16);
  }, [activeId]);
  if (doors.length === 0) return null;
  const cards: RailCard[] = doors.map((door) => ({
    id: door.id,
    href: door.href,
    label: door.label,
    iconKey: ORGANIZATION_DOOR_ICONS[door.id],
  }));
  return (
    <nav ref={navRef} aria-label={ariaLabel} className={className}>
      <CardRail
        label={ariaLabel}
        cards={cards}
        size="regular"
        activeId={activeId}
        swipeHint={swipeHint}
        prevLabel={prevLabel}
        nextLabel={nextLabel}
        testId="organization-doors"
      />
    </nav>
  );
}
