"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE SIGNALS SHEET — the map's signals rail, as one piece.
 *
 * Desktop (lg and up): the rail is simply there, beside the map, always open.
 *
 * Phone: the MAP is the primary surface, so the signals never take its place
 * in the page. They are a bottom sheet pinned to the viewport edge:
 *   - collapsed: one compact bar (the headline signal + a chevron);
 *   - open: the rest sits over the lower part of the map — the page beneath
 *     does not reflow, the map and its layer controls stay in the first
 *     viewport, and the sheet scrolls inside itself when the copy is long.
 * It closes from the bar, with Escape, and after a signal is chosen (the
 * chosen layer is then the thing on screen). No motion: the state change is the
 * content appearing, which is also what `prefers-reduced-motion` asks for.
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
  /** The headline signal, shown on the bar while the sheet is collapsed. */
  readonly summary: string | null;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={cn(
        "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-sheet max-lg:px-3",
        "max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
      data-testid="market-signals-dock"
    >
      <aside
        aria-label={title}
        data-testid="market-signals"
        data-open={open}
        className={cn(
          "rounded-[22px] bg-[rgba(245,241,232,0.035)] shadow-[inset_0_0_0_1px_rgba(245,241,232,0.10)]",
          // The same plate as the home's Surface (26px, hairline), translucent
          // and softly blurred on a phone so the map stays present beneath it.
          "max-lg:rounded-[26px] max-lg:bg-[rgba(10,10,9,0.84)] max-lg:backdrop-blur-xl",
          "max-lg:shadow-[inset_0_0_0_1px_rgba(245,241,232,0.14),0_-10px_36px_rgba(0,0,0,0.38)]",
        )}
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
            className={cn("h-5 w-5 shrink-0 text-text-secondary", !open && "rotate-180")}
            aria-hidden
          />
        </button>
        <div
          id={bodyId}
          data-testid="market-signals-body"
          // A chosen signal navigates to its layer; the sheet gets out of the
          // way so the layer it chose is what the person sees.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={cn(
            "px-4 pb-4 pt-1 lg:block lg:p-5",
            "max-lg:max-h-[min(38dvh,19rem)] max-lg:overflow-y-auto max-lg:overscroll-contain",
            open ? "block" : "hidden",
          )}
        >
          {children}
        </div>
      </aside>
    </div>
  );
}
