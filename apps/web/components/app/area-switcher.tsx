"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

import { Link, usePathname } from "@/lib/i18n/navigation";
import { pathIsInside } from "@/lib/navigation/header-place";
import type { WorkAreaIconKey } from "@/lib/navigation/work-areas";
import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";
import { iconControl } from "@/components/app/conversation/chat/icon-scale";
import { cn } from "@/lib/utils";

export type AreaSwitcherItem = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly iconKey: WorkAreaIconKey;
  readonly testId?: string;
};

/** The useLayoutEffect that SSR does not warn about. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * THE AREA SWITCHER — the light 3D carousel of work areas (owner order
 * 2026-10-25, phase 2 of the one navigation system).
 *
 * Each area is a card with subtle depth, side by side so every label stays
 * readable: the chosen card faces front and lifts, the others turn a few
 * degrees toward it and settle back. When more areas exist than fit, the
 * window glides to keep the choice near the middle (never blank space at an
 * end). It is a CHOOSER, not a navigation strip: there is no scrollbar and
 * nothing scrolls sideways — the cards are positioned, and the selection
 * moves by
 *   · the arrow buttons, the ← → keys, a swipe on a phone;
 *   · keyboard focus: tabbing onto a card brings it to the front, so every
 *     area is reachable with Tab alone (a card leaving the visible window is
 *     taken out of the tab order and returns as the selection reaches it).
 * Every card is a real link: one tap opens the area. The card for the area
 * the person stands in carries the active mark.
 *
 * prefers-reduced-motion (pure CSS, so it holds before and without
 * JavaScript): no rotation and no transitions — the cards keep their places
 * and simply change.
 *
 * The list is handed in by the caller from the ONE area model
 * (`lib/navigation/work-areas.ts`); this component never spells a route.
 */
export function AreaSwitcher({
  title,
  items,
  prevLabel,
  nextLabel,
  hereLabel,
  testId,
}: {
  title: string;
  items: readonly AreaSwitcherItem[];
  prevLabel: string;
  nextLabel: string;
  hereLabel: string;
  testId?: string;
}) {
  const pathname = usePathname();
  const activeIndex = items.findIndex((i) => pathIsInside(pathname, i.href));
  const [selected, setSelected] = useState(activeIndex >= 0 ? activeIndex : 0);
  const [width, setWidth] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number } | null>(null);
  /** Set when a pointer gesture was a swipe, so the click it ends with does
   *  not also open the card under the finger. */
  const swiped = useRef(false);

  useIsoLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const last = items.length - 1;
  const go = useCallback(
    (to: number) => setSelected(Math.max(0, Math.min(last, to))),
    [last],
  );

  if (items.length === 0) return null;

  // Geometry from the track's own width: cards side by side (a light 3D
  // row, not a stack — every label stays readable), as many as fit, never
  // narrower than a label or wider than a comfortable tile.
  const GAP = 12;
  const trackWidth = width || 900;
  const cardWidth = Math.round(Math.max(148, Math.min(196, (trackWidth - GAP * 4) / 4.3)));
  const step = cardWidth + GAP;
  const visible = Math.max(1, Math.floor((trackWidth + GAP) / step));
  const fits = items.length <= visible;
  // The window follows the selection, keeping it near the middle and never
  // leaving blank space at either end.
  const start = fits ? 0 : Math.max(0, Math.min(items.length - visible, selected - Math.floor((visible - 1) / 2)));

  return (
    <section
      aria-label={title}
      aria-roledescription="carousel"
      data-testid={testId}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-support font-medium text-text-muted">{title}</h2>
        <div className={cn("flex items-center gap-1", fits && "invisible")} aria-hidden={fits || undefined}>
          <button
            type="button"
            tabIndex={fits ? -1 : undefined}
            onClick={() => go(selected - 1)}
            disabled={selected === 0}
            aria-label={prevLabel}
            data-testid="area-switcher-prev"
            className="flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:cursor-default disabled:opacity-40"
          >
            <ChevronLeft {...iconControl()} aria-hidden />
          </button>
          <button
            type="button"
            tabIndex={fits ? -1 : undefined}
            onClick={() => go(selected + 1)}
            disabled={selected === last}
            aria-label={nextLabel}
            data-testid="area-switcher-next"
            className="flex size-11 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:cursor-default disabled:opacity-40"
          >
            <ChevronRight {...iconControl()} aria-hidden />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-40 touch-pan-y select-none overflow-hidden [perspective:1100px]"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const next = selected + (e.key === "ArrowRight" ? 1 : -1);
          go(next);
          const target = trackRef.current?.querySelector<HTMLElement>(
            `[data-area-index="${Math.max(0, Math.min(last, next))}"]`,
          );
          target?.focus();
        }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 40) {
            swiped.current = true;
            go(selected + (dx < 0 ? 1 : -1));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          // A swipe that ended on a card is a swipe, not a tap.
          if (swiped.current) {
            e.preventDefault();
            swiped.current = false;
          }
        }}
      >
        <ul className="relative h-full [transform-style:preserve-3d]">
          {items.map((item, i) => {
            const slot = i - start;
            const far = slot < 0 || slot >= visible;
            // The card just past each edge stays in the tab order: focusing it
            // moves the window, so Tab alone walks every area even when only
            // two cards fit (a phone).
            const untabbable = slot < -1 || slot > visible;
            const isSelected = i === selected;
            const isHere = i === activeIndex;
            const Icon = WORK_AREA_ICONS[item.iconKey];
            // The light 3D pose: the chosen card faces front and lifts; the
            // others turn a few degrees toward it and settle back. The pose
            // lives in CSS variables; the class composes it, and the
            // reduced-motion variant composes it WITHOUT the rotation.
            const toward = i < selected ? 7 : -7;
            const pose = {
              "--area-x": `${slot * step}px`,
              "--area-y": isSelected ? "-4px" : "0px",
              "--area-z": isSelected ? "0px" : "-28px",
              "--area-ry": isSelected ? "0deg" : `${toward}deg`,
              "--area-s": isSelected ? "1" : "0.97",
            } as React.CSSProperties;
            return (
              <li
                key={item.id}
                aria-hidden={untabbable || undefined}
                className="absolute left-0 top-3 transition-[transform,opacity] duration-300 ease-out [transform:translate3d(var(--area-x),var(--area-y),var(--area-z))_rotateY(var(--area-ry))_scale(var(--area-s))] motion-reduce:transition-none motion-reduce:[transform:translate3d(var(--area-x),0,0)]"
                style={{
                  ...pose,
                  width: cardWidth,
                  zIndex: isSelected ? 20 : 10,
                  // The card just past an edge peeks, faded: there is more this way.
                  opacity: slot === -1 || slot === visible ? 0.35 : far ? 0 : isSelected ? 1 : 0.88,
                  pointerEvents: far ? "none" : undefined,
                }}
              >
                <Link
                  href={item.href as "/dashboard"}
                  data-testid={item.testId}
                  data-area-index={i}
                  data-selected={isSelected || undefined}
                  aria-current={isHere ? "page" : undefined}
                  tabIndex={untabbable ? -1 : undefined}
                  // A link is natively draggable: the browser's drag would
                  // cancel the swipe (pointercancel) after the first card.
                  draggable={false}
                  onFocus={() => setSelected(i)}
                  className={cn(
                    "flex h-32 flex-col justify-between rounded-xl border p-3.5 outline-none transition-[box-shadow,border-color,background-color] duration-300 focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none",
                    isSelected
                      ? "border-brand-blue/60 bg-ink-800 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.75)]"
                      : "border-ink-600 bg-ink-800/80 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.7)] hover:border-ink-500",
                  )}
                >
                  <span className="flex items-start justify-between">
                    <span
                      className={cn(
                        "flex size-10 items-center justify-center rounded-lg",
                        isSelected ? "bg-brand-blue/15 text-brand-blue" : "bg-ink-700/70 text-text-secondary",
                      )}
                    >
                      <Icon {...iconControl()} aria-hidden />
                    </span>
                    {isHere ? (
                      <span className="text-meta font-semibold uppercase tracking-wide text-brand-blue">{hereLabel}</span>
                    ) : (
                      <ArrowUpRight
                        {...iconControl(cn("transition-opacity", isSelected ? "text-brand-blue opacity-100" : "opacity-0"))}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="text-support font-semibold leading-snug text-text-primary">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
