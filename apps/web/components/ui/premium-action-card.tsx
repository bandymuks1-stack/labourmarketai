import type { ComponentType } from "react";
import { Check } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * PREMIUM ACTION CARD (owner design direction 2026-10-26) — the one reusable
 * card for the places where a person CHOOSES what to do: an action, a work
 * area, a profession, a category. Black and gold, calm, a little physical:
 * depth comes from light and shadow and a slight lean on hover (`.lm-card3d`
 * in globals.css — transform + box-shadow only, no 3D library), one simple
 * line icon and a short name that reads in three seconds.
 *
 * Two sizes, because a screen's actions are not equal (owner review
 * 2026-10-26: "atskirti pagrindinius veiksmus nuo antrinių"):
 *  - `feature` — the main things a person comes to the page to do. Raised,
 *    roomy; horizontal from `sm` up so a desktop row uses its width.
 *  - `compact` — secondary tools: a low, flatter row card.
 * Navigation (tabs, view switches, the organization doors) is NOT a card.
 *
 * Rules it keeps:
 *  - It is a LINK to a real destination (a route or an in-page anchor), never
 *    decoration.
 *  - One `emphasis="primary"` per screen — told by its gold-filled icon.
 *  - `active` marks where the person already is (`aria-current="page"`) by a
 *    gold edge and a corner mark — never a second look-alike highlight.
 *  - ≥ 44 px to tap, a visible focus ring, no movement under
 *    `prefers-reduced-motion`.
 */
export type PremiumActionIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface PremiumActionCardProps {
  readonly href: string;
  readonly icon: PremiumActionIcon;
  /** Two or three words. */
  readonly label: string;
  /** One short line. A `feature` card shows it from `sm` up (or always with
   *  `hintAlways`); a `compact` card never shows it. */
  readonly hint?: string;
  readonly hintAlways?: boolean;
  /** A count to act on, with its spoken form. */
  readonly badge?: { readonly value: string; readonly label: string } | null;
  readonly active?: boolean;
  readonly emphasis?: "primary" | "default";
  readonly size?: "feature" | "compact";
  /** Span the full phone width (the primary), with its hint shown there. */
  readonly wide?: boolean;
  readonly testId?: string;
}

export function PremiumActionCard({
  href,
  icon: Icon,
  label,
  hint,
  hintAlways = false,
  badge,
  active = false,
  emphasis = "default",
  size = "feature",
  wide = false,
  testId,
}: PremiumActionCardProps) {
  const primary = emphasis === "primary";
  const compact = size === "compact";
  return (
    <Link
      href={href as "/dashboard"}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      data-emphasis={emphasis}
      data-size={size}
      className={cn(
        "lm-card3d group relative flex w-full rounded-[1.25rem] border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900",
        // Phone first (owner review 2026-10-26: shorter cards, the list sooner):
        // a feature card is a 68 px row, a compact tool a 72 px tile in a row
        // of three; from `sm` up both open into roomier rows.
        compact
          ? "lm-card3d--flat min-h-[4.5rem] flex-col items-center justify-center gap-1.5 px-2 py-2.5 text-center sm:min-h-14 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-3 sm:text-left"
          : "min-h-[4.25rem] flex-row items-center gap-3 px-3 py-3 text-left sm:min-h-24 sm:gap-4 sm:px-5 sm:py-4",
        active
          ? "border-brand-blue ring-1 ring-brand-blue/60"
          : primary
            ? "lm-card3d--primary border-brand-blue/40"
            : "border-ink-600 hover:border-brand-blue/40",
      )}
    >
      {active && !badge ? (
        <span
          aria-hidden
          className="absolute right-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue text-text-on-brand"
        >
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
      {badge ? (
        <span
          className="absolute right-2.5 top-2.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1.5 text-meta font-semibold tabular-nums text-text-on-brand"
          data-testid={testId ? `${testId}-badge` : undefined}
        >
          <span aria-hidden>{badge.value}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      ) : null}
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center border",
          compact ? "h-8 w-8 rounded-lg sm:h-9 sm:w-9 sm:rounded-xl" : "h-10 w-10 rounded-xl sm:h-12 sm:w-12 sm:rounded-2xl",
          // The primary's icon is a small solid gold object (a lit top edge,
          // a soft drop) — no glow.
          primary
            ? "border-transparent bg-gradient-cta text-text-on-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_4px_-1px_rgb(0_0_0/0.45)]"
            : "border-brand-blue/25 bg-brand-blue/10 text-brand-blue",
        )}
      >
        <Icon className={compact ? "h-4 w-4 sm:h-[1.125rem] sm:w-[1.125rem]" : "h-5 w-5 sm:h-6 sm:w-6"} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={cn("flex min-w-0 flex-col gap-0.5", compact && "items-center sm:items-start")}>
        <span
          className={cn(
            "text-balance font-semibold text-text-primary",
            compact ? "text-xs leading-tight sm:text-sm sm:leading-snug" : "text-sm leading-snug sm:text-base",
          )}
        >
          {label}
        </span>
        {hint && !compact ? (
          <span
            className={cn(
              "text-balance text-xs leading-snug text-text-muted",
              hintAlways || wide ? "block" : "hidden sm:block",
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

type DeckItem = PremiumActionCardProps & { readonly key: string };

/**
 * A deck of action cards. `feature`: two columns on a phone (a `wide` card
 * spans both), three from `sm` up. `compact`: three small tiles in one row on
 * a phone, three rows-cards from `sm` up. Both wrap — never a sideways strip.
 */
export function PremiumActionDeck({
  ariaLabel,
  items,
  size = "feature",
  testId,
  className,
}: {
  readonly ariaLabel: string;
  readonly items: readonly DeckItem[];
  readonly size?: "feature" | "compact";
  readonly testId?: string;
  readonly className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} data-testid={testId} className={className}>
      <ul
        className={cn(
          "grid",
          size === "compact" ? "auto-rows-fr grid-cols-3 gap-2 sm:gap-3" : "auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3",
        )}
      >
        {items.map(({ key, ...card }) => (
          <li key={key} className={cn("flex", card.wide && "col-span-2 sm:col-span-1")}>
            <PremiumActionCard size={size} {...card} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
