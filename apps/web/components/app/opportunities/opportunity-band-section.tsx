import type { ReactNode } from "react";

import type { FitBand } from "@/lib/opportunities/fit-band";

/**
 * ONE BAND of the PASAULIS destination — a heading that names the band and
 * how many rows it holds, the rows beneath it.
 *
 * A section renders only for a band that has rows; the STRONG band is the
 * one exception, rendered empty with the honest reason (`emptyReading`)
 * because "no strong fit" is an answer the person came for, and the codes
 * that would change it are the engine's own, never invented here.
 *
 * Server-safe, no i18n of its own: every word arrives resolved.
 */
export function OpportunityBandSection({
  band,
  title,
  count,
  emptyReading,
  children,
}: {
  readonly band: FitBand;
  readonly title: string;
  readonly count: number;
  /** Rendered instead of rows when the band is empty (STRONG only). */
  readonly emptyReading?: ReactNode;
  readonly children?: ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="opportunities-band"
      data-band={band}
      data-count={count}
      aria-label={title}
    >
      <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-card-title font-bold tracking-tightest text-text-primary">
          {title}
        </span>
        <span className="font-mono text-meta text-text-muted">· {count}</span>
      </h2>
      {count === 0 ? (
        <div
          className="rounded-lg border border-dashed border-ink-500 px-4 py-4"
          data-testid="opportunities-band-empty"
        >
          {emptyReading}
        </div>
      ) : (
        /* The row list (a `<ul>`) is the caller's — the destination decides
           the grid, this section decides only the heading and the count. */
        children
      )}
    </section>
  );
}
