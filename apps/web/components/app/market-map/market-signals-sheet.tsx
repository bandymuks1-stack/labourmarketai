"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE SIGNALS SHEET — the map's signals rail, as one piece.
 *
 * Desktop (lg and up): the rail is simply there, beside the map, always open.
 * Phone: it is a compact sheet ABOVE the map — one summary line (the headline
 * signal) and a tap target that opens the rest in place. No fixed overlay, so
 * it can never cover the map's own controls or the composer-less page, and no
 * motion: the state change is the content appearing, which is what
 * `prefers-reduced-motion` asks for anyway.
 *
 * The children are server-rendered; this wrapper only owns open/closed.
 */
export function MarketSignalsSheet({
  title,
  toggleLabel,
  summary,
  children,
}: {
  readonly title: string;
  readonly toggleLabel: string;
  /** The headline signal, shown while the sheet is collapsed on a phone. */
  readonly summary: string | null;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <aside
      aria-label={title}
      data-testid="market-signals"
      data-open={open}
      className="rounded-[22px] bg-[rgba(245,241,232,0.035)] shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)]"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        data-testid="market-signals-toggle"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left lg:hidden"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-meta uppercase tracking-label text-text-muted">{toggleLabel}</span>
          {summary ? <span className="block truncate text-support text-text-primary">{summary}</span> : null}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-text-secondary", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <div id={bodyId} className={cn("px-4 pb-4 pt-1 lg:block lg:p-5", open ? "block" : "hidden")}>
        {children}
      </div>
    </aside>
  );
}
