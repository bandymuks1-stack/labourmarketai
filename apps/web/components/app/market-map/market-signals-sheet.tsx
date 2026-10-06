"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { MARKET_LAYER_EVENT } from "@/components/app/market-map/world-discovery";
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
  // OPEN is derived from the layer the sheet was opened on, not stored as a
  // bare flag: choosing a signal navigates to another `?layer=`, and the sheet
  // simply stops being open when that layer commits. (Hiding the link inside the
  // click itself aborts the in-flight navigation — the layer never switched.)
  const layerParam = useSearchParams().get("layer") ?? "";
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === layerParam;
  const setOpen = (next: boolean) => setOpenAt(next ? layerParam : null);
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
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
          // and softly blurred on a phone so the map stays present beneath it. The
          // plate is a THEME token (not a fixed dark rgba) so text stays readable in light.
          "max-lg:rounded-[26px] max-lg:bg-ink-900/85 max-lg:backdrop-blur-xl",
          "max-lg:shadow-[inset_0_0_0_1px_rgba(245,241,232,0.14),0_-10px_36px_rgba(0,0,0,0.38)]",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          data-testid="market-signals-toggle"
          onClick={() => setOpen(!open)}
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
          // A chosen signal navigates to its layer and the sheet closes when that
          // layer commits (see `open`). A signal for the layer already showing
          // causes no navigation, so that one closes right away.
          onClick={(e) => {
            const anchor = (e.target as HTMLElement).closest("a");
            if (!anchor) return;
            const target = new URL(anchor.href, window.location.href);
            if (target.pathname !== window.location.pathname) return; // another page: a normal navigation
            const layer = target.searchParams.get("layer") ?? "";
            if (!layer) return;
            // Same page: the one map switches layer in place — no round trip, so
            // nothing can stall — and the URL follows so the view is shareable.
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(MARKET_LAYER_EVENT, { detail: layer }));
            window.history.replaceState(null, "", target.pathname + target.search);
            setOpenAt(null);
          }}
          className={cn(
            "px-4 pb-4 pt-1 lg:block lg:p-5",
            "max-lg:max-h-[min(22dvh,12rem)] max-lg:overflow-y-auto max-lg:overscroll-contain",
            open ? "block" : "hidden",
          )}
        >
          {children}
        </div>
      </aside>
    </div>
  );
}
