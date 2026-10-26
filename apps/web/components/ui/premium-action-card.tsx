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
  /** Lay a feature card out horizontally on a phone too (a full-width
   *  primary). */
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
  const horizontal = compact || wide;
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
        compact
          ? "lm-card3d--flat min-h-14 flex-row items-center gap-3 px-4 py-3 text-left"
          : horizontal
            ? "min-h-24 flex-row items-center gap-4 px-5 py-4 text-left"
            : "min-h-[7.5rem] flex-col items-center justify-center gap-2.5 px-3 py-4 text-center sm:min-h-24 sm:flex-row sm:justify-start sm:gap-4 sm:px-5 sm:text-left",
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
          compact ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl",
          primary
            ? "border-transparent bg-gradient-cta text-text-on-brand shadow-cta-glow"
            : "border-brand-blue/20 bg-brand-blue/10 text-brand-blue",
        )}
      >
        <Icon className={compact ? "h-[1.125rem] w-[1.125rem]" : "h-6 w-6"} strokeWidth={1.75} aria-hidden />
      </span>
      <span className={cn("flex min-w-0 flex-col gap-0.5", !horizontal && "items-center sm:items-start")}>
        <span
          className={cn(
            "text-balance font-semibold leading-snug text-text-primary",
            compact ? "text-sm" : "text-base",
          )}
        >
          {label}
        </span>
        {hint && !compact ? (
          <span
            className={cn(
              "text-balance text-xs leading-snug text-text-muted",
              hintAlways || horizontal ? "block" : "hidden sm:block",
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
 * spans both), three from `sm` up. `compact`: one column on a phone, three
 * from `sm` up. Both wrap — never a sideways strip.
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
          size === "compact" ? "grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3" : "auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3",
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
