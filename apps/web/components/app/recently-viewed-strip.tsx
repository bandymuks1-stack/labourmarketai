"use client";

import { useEffect, useState } from "react";
import {
  clearRecentlyViewedInStorage,
  readRecentlyViewedFromStorage,
} from "@/lib/opportunities/recently-viewed";

/**
 * "Recently viewed" strip above the worker opportunities board (P2-PR5).
 *
 * DEVICE-LOCAL ONLY: the ids come from this browser's localStorage (recorded
 * when a card's detail disclosure is opened) and are re-joined against the
 * LIVE, already-authorized board rows passed down by the server page — an id
 * whose demand is no longer on the board simply does not render (localStorage
 * never stores facts, so nothing stale can ever show). The disclosure line
 * states explicitly that the list is stored only on this device. Read in an
 * effect (post-hydration) so SSR and first client render always match.
 */
export interface RecentlyViewedLiveRow {
  readonly id: string;
  readonly title: string;
  readonly scanLine: string;
}

export function RecentlyViewedStrip({
  liveRows,
  labels,
}: {
  liveRows: readonly RecentlyViewedLiveRow[];
  labels: {
    title: string;
    deviceOnly: string;
    clear: string;
  };
}) {
  const [viewedIds, setViewedIds] = useState<readonly string[]>([]);
  useEffect(() => {
    setViewedIds(readRecentlyViewedFromStorage().map((e) => e.id));
  }, []);

  const byId = new Map(liveRows.map((r) => [r.id, r]));
  const matches = viewedIds
    .map((id) => byId.get(id))
    .filter((r): r is RecentlyViewedLiveRow => r !== undefined);
  if (matches.length === 0) return null;

  const onClear = () => {
    clearRecentlyViewedInStorage();
    setViewedIds([]);
  };

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-ink-600 bg-ink-800/30 p-4"
      data-testid="opportunities-recently-viewed"
      aria-label={labels.title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {labels.title}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-[2.75rem] items-center rounded-md px-2 text-xs font-medium text-brand-blue hover:text-brand-cyan"
          data-testid="opportunities-recently-viewed-clear"
        >
          {labels.clear}
        </button>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {matches.map((r) => (
          <li key={r.id}>
            {/* In-page anchor to the live card — navigation, not a fake action. */}
            <a
              href={`#opp-${r.id}`}
              className="inline-flex min-h-[2.75rem] flex-col justify-center rounded-md border border-ink-500 px-3 py-1.5 transition-colors hover:border-brand-blue"
              data-testid="opportunities-recently-viewed-item"
            >
              <span className="text-xs font-semibold text-text-primary">{r.title}</span>
              <span className="text-meta text-text-muted">{r.scanLine}</span>
            </a>
          </li>
        ))}
      </ul>
      {/* Explicit storage disclosure — REQUIRED copy: this device only. */}
      <p className="text-meta leading-relaxed text-text-muted">{labels.deviceOnly}</p>
    </section>
  );
}
