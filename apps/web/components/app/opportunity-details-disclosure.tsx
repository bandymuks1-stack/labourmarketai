"use client";

import { useId, useState, type ReactNode } from "react";
import { recordRecentlyViewedInStorage } from "@/lib/opportunities/recently-viewed";

/**
 * In-card progressive disclosure (Marketplace Precision PR 4). A REAL button
 * with aria-expanded/aria-controls toggling a server-rendered details region.
 * The children are always in the HTML (SSR-complete, crawl/test friendly);
 * only visibility toggles client-side. No data fetching, no fake controls.
 *
 * P2-PR5: when `recentlyViewedId` is set, OPENING the disclosure records that
 * id (plus a timestamp, nothing else) in this device's localStorage for the
 * "Recently viewed" strip — device-local only, never sent to the server.
 */
export function OpportunityDetailsDisclosure({
  showLabel,
  hideLabel,
  testId,
  recentlyViewedId,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  testId?: string;
  recentlyViewedId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  const onToggle = () => {
    if (!open && recentlyViewedId) recordRecentlyViewedInStorage(recentlyViewedId);
    setOpen(!open);
  };
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className="inline-flex w-fit min-h-[2.25rem] items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-brand-blue"
      >
        <span aria-hidden className="font-mono text-[10px] text-text-muted">
          {open ? "−" : "+"}
        </span>
        {open ? hideLabel : showLabel}
      </button>
      <div id={regionId} hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}
