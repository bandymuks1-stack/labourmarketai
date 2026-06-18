"use client";

import { useTranslations } from "next-intl";
import { Navigation } from "lucide-react";
import { wazeDeepLink, type WazeDestination } from "@/lib/maps/waze";

/**
 * "Open in Waze" — external navigation HANDOFF only.
 *
 * Opens Waze (app on mobile, Live Map on web) at the destination.
 * Labourmarket.ai does NOT compute or claim a Waze ETA / travel time, does NOT
 * scrape Waze, and uses no Waze API / key. Renders nothing unless a real,
 * permitted destination is provided — the caller passes only permitted
 * destinations (never an exact personal home address; see wazeDestinationFromLocation).
 */
export function OpenInWaze({
  destination,
}: {
  readonly destination: WazeDestination | null;
}) {
  const t = useTranslations("waze");
  if (!destination) return null;
  return (
    <a
      href={wazeDeepLink(destination)}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid="open-in-waze"
      className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:border-brand-blue"
    >
      <Navigation className="h-3.5 w-3.5 text-brand-blue" strokeWidth={1.75} aria-hidden />
      {t("open")}
    </a>
  );
}