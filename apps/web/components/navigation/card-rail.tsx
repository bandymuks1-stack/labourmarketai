"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { ChevronLeft, ChevronRight, Pin, PinOff } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { NAV_CARD_ICONS } from "@/components/navigation/nav-card-icon";
import type { NavCardIconKey } from "@/lib/navigation/nav-card-icons";
import { cn } from "@/lib/utils";

/** A fragment (`#…`) stays on the page, so it is a plain anchor; everything
 *  else goes through the locale-aware Link. */
const CardLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<"a"> & { href: string }>(
  function CardLink({ href, ...rest }, ref) {
    return href.startsWith("#") ? (
      <a ref={ref} href={href} {...rest} />
    ) : (
      // A signed-in destination is never prefetched from a public page.
      <Link ref={ref} href={href} prefetch={href.startsWith("/dashboard") ? false : undefined} {...rest} />
    );
  },
);

export type RailCard = {
  readonly id: string;
  /** Locale-less internal path, or a fragment of the current page. Every
   *  card is a real link. */
  readonly href: string;
  readonly label: string;
  /** One short line; hidden on phones in the compact size. */
  readonly description?: string;
  /** A small factual line, e.g. "Opens now". */
  readonly note?: string;
  readonly iconKey: NavCardIconKey;
  /**
   * A pin toggle in the card's corner (signed-in homes). It renders as a
   * SIBLING of the card's link — never inside it — so the two controls have
   * separate names, separate focus stops and separate 44px targets.
   */
  readonly pin?: {
    readonly pressed: boolean;
    /** The full accessible name, e.g. "Pin Journal" / "Unpin Journal". */
    readonly label: string;
    readonly onToggle: () => void;
  };
};

/**
 * THE CARD RAIL — the one horizontal rail of the navigation system (owner
 * concept 2026-11-12): goals, a goal's functions and catalogues all use it,
 * on the public site and in the signed-in app.
 *
 * A native horizontal scroller with scroll-snap, so a swipe is the browser's
 * own and the scroll position is never reset by a selection. On a phone the
 * cards are compact (icon on top, a two-line name), about three and a half
 * show, the right edge fades while there is more, and a dot indicator with
 * the word "swipe" sits under the rail. On a wide screen the cards share the
 * row and carry their one-line description; arrow buttons appear only when
 * the content actually overflows, and never on touch widths.
 *
 * Every card is a plain link (works without JavaScript). `onSelect` lets a
 * caller take a click over for in-place navigation; modified clicks (new tab)
 * are left to the browser. ← / → on a focused card move to its neighbour.
 *
 * Motion: smooth scrolling and the hover lift are switched off under
 * prefers-reduced-motion. Nothing moves on its own. Icon tiles are a fixed
 * size (the future photo slot), so nothing shifts while loading.
 */
export function CardRail({
  label,
  cards,
  size = "regular",
  phoneGrid = false,
  phoneHiddenIds,
  activeId,
  onSelect,
  swipeHint,
  prevLabel,
  nextLabel,
  testId,
}: {
  /** Accessible name of the rail. */
  label: string;
  cards: readonly RailCard[];
  /** `compact`: the phone goal card (no description below `sm`). */
  size?: "compact" | "regular";
  /** Cards left out below `sm` (shown elsewhere there, e.g. under "more
   *  choices"). From `sm` up they are in the rail as usual. */
  phoneHiddenIds?: readonly string[];
  /**
   * Below `sm`, lay the cards out as a three-column grid instead of a
   * scroller, so a short list (the goals) is all on the first screen with no
   * swipe. From `sm` up nothing changes. For a list of up to about nine
   * cards; a long list (professions) stays a rail.
   */
  phoneGrid?: boolean | 2;
  activeId?: string | null;
  onSelect?: (card: RailCard) => void;
  swipeHint: string;
  prevLabel: string;
  nextLabel: string;
  /** The rail's test id. Its parts are addressed inside it by
   *  `data-rail-part` and its cards by `data-card-id`. */
  testId: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true, pages: 1, page: 0 });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pages = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth) - 0.05));
    setEdge({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft >= max - 1,
      pages,
      page: max <= 0 ? 0 : Math.round((el.scrollLeft / max) * (pages - 1)),
    });
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, cards.length]);

  const overflows = !(edge.start && edge.end);

  const scrollByView = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  const onKey = (e: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = trackRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-rail-card]")[
      index + (e.key === "ArrowRight" ? 1 : -1)
    ];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const onClick = (e: MouseEvent<HTMLAnchorElement>, card: RailCard) => {
    if (!onSelect) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect(card);
  };

  if (cards.length === 0) return null;
  const compact = size === "compact";
  const arrow =
    "hidden size-11 shrink-0 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none md:inline-flex";

  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {overflows && (
          <button
            type="button"
            onClick={() => scrollByView(-1)}
            disabled={edge.start}
            aria-label={prevLabel}
            data-rail-part="prev"
            className={arrow}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
        )}
        <ul
          ref={trackRef}
          aria-label={label}
          data-rail-part="track"
          data-more={!edge.end || undefined}
          className={cn(
            "min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden",
            phoneGrid === 2 ? "grid grid-cols-2 sm:flex" : phoneGrid ? "grid grid-cols-3 sm:flex" : "flex",
            // The right edge fades while there is more to the right.
            "data-[more]:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]",
          )}
        >
          {cards.map((card, index) => {
            const Icon = NAV_CARD_ICONS[card.iconKey];
            const active = activeId === card.id;
            return (
              <li
                key={card.id}
                className={cn(
                  "relative shrink-0 snap-start",
                  phoneHiddenIds?.includes(card.id) && "max-sm:hidden",
                  compact
                    ? cn(phoneGrid ? "w-auto" : "w-[5.75rem]", "sm:w-auto sm:min-w-40 sm:flex-1")
                    : phoneGrid
                      ? "w-auto sm:w-44"
                      : "w-36 sm:w-44",
                )}
              >
                <CardLink
                  href={card.href}
                  data-rail-card
                  data-card-id={card.id}
                  aria-current={active ? "true" : undefined}
                  onClick={(e) => onClick(e, card)}
                  onKeyDown={(e) => onKey(e, index)}
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-xl border p-3 outline-none transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand-blue motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    compact ? "min-h-[6.5rem] items-center text-center sm:items-start sm:p-4 sm:text-left" : "min-h-[7.5rem] sm:p-4",
                    active
                      ? "border-brand-blue bg-ink-800"
                      : "border-ink-600 bg-ink-800/50 hover:border-ink-500",
                  )}
                >
                  {/* The tile is the photo slot: a fixed square, so a licensed
                      image can replace the icon later with no layout change. */}
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-brand-blue/15 text-brand-blue" : "bg-ink-700/70 text-text-secondary",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="line-clamp-3 hyphens-auto text-sm font-semibold leading-snug text-text-primary [overflow-wrap:anywhere]">
                      {card.label}
                    </span>
                    {card.description && (
                      <span
                        className={cn(
                          "line-clamp-3 text-xs leading-snug text-text-muted",
                          compact && "hidden sm:[display:-webkit-box]",
                        )}
                      >
                        {card.description}
                      </span>
                    )}
                    {card.note && (
                      <span className="text-xs leading-snug text-text-muted">{card.note}</span>
                    )}
                  </span>
                </CardLink>
                {card.pin && (
                  <button
                    type="button"
                    aria-pressed={card.pin.pressed}
                    aria-label={card.pin.label}
                    title={card.pin.label}
                    data-rail-pin={card.id}
                    onClick={card.pin.onToggle}
                    className={cn(
                      "absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl transition-colors motion-reduce:transition-none",
                      card.pin.pressed ? "text-brand-blue" : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    {card.pin.pressed ? (
                      <PinOff aria-hidden className="size-4" />
                    ) : (
                      <Pin aria-hidden className="size-4" />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {overflows && (
          <button
            type="button"
            onClick={() => scrollByView(1)}
            disabled={edge.end}
            aria-label={nextLabel}
            data-rail-part="next"
            className={arrow}
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        )}
      </div>
      {/* Touch widths: it must be obvious there is more. */}
      {overflows && (
        <p
          aria-hidden
          data-rail-part="hint"
          className="flex items-center gap-2 text-xs text-text-muted md:hidden"
        >
          <span className="flex items-center gap-1">
            {Array.from({ length: edge.pages }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none",
                  i === edge.page ? "w-4 bg-brand-blue" : "w-1.5 bg-ink-500",
                )}
              />
            ))}
          </span>
          {swipeHint}
        </p>
      )}
    </div>
  );
}
