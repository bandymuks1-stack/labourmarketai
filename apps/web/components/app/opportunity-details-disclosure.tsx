"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * In-card progressive disclosure (Marketplace Precision PR 4). A REAL button
 * with aria-expanded/aria-controls toggling a server-rendered details region.
 * The children are always in the HTML (SSR-complete, crawl/test friendly);
 * only visibility toggles client-side. No data fetching, no fake controls.
 */
export function OpportunityDetailsDisclosure({
  showLabel,
  hideLabel,
  testId,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
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
