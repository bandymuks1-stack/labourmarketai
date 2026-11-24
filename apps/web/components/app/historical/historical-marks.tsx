import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import {
  objectMonogram,
  type RingSegment,
} from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE MARKS every historical view is drawn with (LABOURMARKET_VISUAL_FIRST
 * constitution; owner correction 2026-09-17: "avatar / person, time position,
 * place / work marker and duration should communicate the state visually;
 * codes / legends are secondary").
 *
 *   PersonMark    the ONE identity tile — the canonical monogram on the
 *                 canonical surface, in five sizes. Never a synthesised face.
 *                 With `ring`, the EVIDENCE RING: one arc per week of the
 *                 period, its length the days this person is evidenced that
 *                 week. Real weeks only — a shape from evidence, not a score.
 *   PersonToken   the person placed on an object on a day: the same tile
 *                 with the day's state — solid when the hours there are
 *                 stated, DASHED when the source never split them (`?`).
 *   ObjectMark    a place as a place: the square tile with the location
 *                 glyph, in four sizes. Square where a person is round, so
 *                 the two are never confused at a glance.
 *   PlaceMark     a place with its NAME, for lists and cells. The monogram
 *                 (`T3`) exists only as a tooltip / accessible detail — it is
 *                 not the information architecture.
 *
 * Pure presentation; no client directive so both server and client trees
 * can use them. Colour is never the only signal: every state also has a
 * shape (dash), a glyph or a text token.
 */

const TILE = cn(
  "inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold leading-none",
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
);

const SIZE = {
  xs: "h-5 w-5 text-meta",
  sm: "h-7 w-7 text-meta",
  md: "h-10 w-10 text-support",
  lg: "h-14 w-14 text-card-title",
  xl: "h-24 w-24 text-title-lg",
} as const;
const RING_PX = { xs: 20, sm: 28, md: 40, lg: 56, xl: 96 } as const;

export function PersonMark({
  label,
  size = "md",
  lit,
  ring,
  ringLabel,
  className,
}: {
  label: string;
  size?: keyof typeof SIZE;
  /** Selected / highlighted: the brand ring. */
  lit?: boolean;
  /** The evidence ring — one segment per week of the period. */
  ring?: readonly RingSegment[];
  /** Localized accessible text for the ring ("evidenced N of M weeks"). */
  ringLabel?: string;
  className?: string;
}) {
  const tile = (
    <span
      aria-hidden
      title={label}
      data-person-mark={label}
      className={cn(
        TILE,
        SIZE[size],
        lit && !ring
          ? "ring-2 ring-brand-blue ring-offset-1 ring-offset-ink-900"
          : "",
        className,
      )}
    >
      {playerInitials(label)}
    </span>
  );
  if (!ring || ring.length === 0) return tile;
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      data-testid="evidence-ring"
      data-weeks={ring.filter((r) => r.days > 0).length}
    >
      {tile}
      <EvidenceRing ring={ring} px={RING_PX[size]} lit={lit} />
      {ringLabel && <span className="sr-only">{ringLabel}</span>}
    </span>
  );
}

/** The ring itself: an SVG drawn around the tile, one arc slot per week of
 *  the period, the arc inside each slot as long as the week's evidenced days
 *  (of 7). Absent weeks stay a faint track — absence of evidence, not zero. */
function EvidenceRing({
  ring,
  px,
  lit,
}: {
  ring: readonly RingSegment[];
  px: number;
  lit?: boolean;
}) {
  const pad = px >= 56 ? 6 : 4;
  const stroke = px >= 56 ? 3 : 2;
  const size = px + pad * 2 + stroke;
  const r = px / 2 + pad;
  const c = size / 2;
  const n = ring.length;
  const gap = n > 12 ? 0.02 : 0.04; // radians of breathing room between slots
  const slot = (Math.PI * 2) / n;
  // Coordinates are rounded: Node and the browser disagree in the 15th
  // decimal of a cosine, which is enough for React to refuse hydration.
  const f = (n: number) => Math.round(n * 100) / 100;
  const arc = (from: number, to: number) => {
    const a0 = from - Math.PI / 2;
    const a1 = to - Math.PI / 2;
    const large = to - from > Math.PI ? 1 : 0;
    return `M ${f(c + r * Math.cos(a0))} ${f(c + r * Math.sin(a0))} A ${r} ${r} 0 ${large} 1 ${f(c + r * Math.cos(a1))} ${f(c + r * Math.sin(a1))}`;
  };
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className={cn("stroke-ink-600", lit ? "stroke-brand-blue/40" : "")}
      />
      {ring.map((seg, i) => {
        if (seg.days <= 0) return null;
        const from = i * slot + gap / 2;
        const to =
          from + Math.max(0.06, (slot - gap) * Math.min(1, seg.days / 7));
        return (
          <path
            key={seg.isoWeek}
            d={arc(from, to)}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className={lit ? "stroke-brand-blue" : "stroke-brand-cyan"}
            data-ring-week={seg.isoWeek}
            data-ring-days={seg.days}
          />
        );
      })}
    </svg>
  );
}

/** The person placed on a place on a day. `hours === null` is the UNKNOWN
 *  state: a dashed outline and the `?` in the title — the source never split
 *  the day's hours between its places. Never divided, never zero. */
export function PersonToken({
  label,
  hours,
  title,
  size = "sm",
  lit,
  dim,
  warning,
  className,
}: {
  label: string;
  hours: number | null;
  /** Full tooltip, already formatted. */
  title: string;
  size?: "xs" | "sm" | "md";
  lit?: boolean;
  dim?: boolean;
  /** A week/date conflict on this token. */
  warning?: boolean;
  className?: string;
}) {
  const unknown = hours === null;
  return (
    <span
      aria-hidden
      title={title}
      data-person-token={label}
      data-token-state={unknown ? "unknown" : "actual"}
      className={cn(
        TILE,
        SIZE[size],
        "relative outline outline-2 outline-offset-1",
        unknown
          ? "outline-dashed outline-text-muted/60"
          : "outline-brand-cyan/70",
        lit ? "outline-brand-blue ring-2 ring-brand-blue/30" : "",
        dim && !lit ? "opacity-25" : "",
        className,
      )}
    >
      {playerInitials(label)}
      {warning && (
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-state-amber" />
      )}
    </span>
  );
}

const SQUARE =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-ink-500 bg-ink-700 text-text-primary";
const SQUARE_SIZE = {
  xs: "h-5 w-5",
  sm: "h-7 w-7",
  md: "h-10 w-10",
  lg: "h-14 w-14",
} as const;
const GLYPH_SIZE = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
} as const;

/** A place as a place: the square location tile. */
export function ObjectMark({
  name,
  size = "md",
  lit,
  label,
  className,
}: {
  name: string;
  size?: keyof typeof SQUARE_SIZE;
  lit?: boolean;
  /** Localized word for the glyph ("object"). */
  label: string;
  className?: string;
}) {
  return (
    <span
      title={`${name} (${objectMonogram(name)})`}
      data-object-mark={name}
      className={cn(
        SQUARE,
        SQUARE_SIZE[size],
        lit ? "border-brand-blue bg-brand-blue/15" : "",
        className,
      )}
    >
      <SemanticIcon
        concept="object"
        label={label}
        className={cn(
          GLYPH_SIZE[size],
          lit ? "text-brand-blue" : "text-text-secondary",
        )}
        strokeWidth={size === "lg" ? 1.75 : 2}
      />
    </span>
  );
}

/** A place as a block: glyph + name (+ an optional figure on the right).
 *  `dense` truncates the name for calendar / field cells. */
export function PlaceMark({
  name,
  figure,
  lit,
  dim,
  dense,
  label,
  className,
}: {
  name: string;
  /** Hours or days already formatted, or "?" for an unknown split. */
  figure?: string | null;
  lit?: boolean;
  dim?: boolean;
  dense?: boolean;
  /** Localized word for the glyph ("objektas"). */
  label: string;
  className?: string;
}) {
  return (
    <span
      title={`${name} (${objectMonogram(name)})${figure ? ` · ${figure}` : ""}`}
      data-place-mark={name}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded border px-1.5 leading-none",
        dense ? "min-h-5 text-meta" : "min-h-7 text-support",
        lit
          ? "border-brand-blue bg-brand-blue/15 text-text-primary"
          : "border-ink-600 bg-ink-800/70 text-text-primary",
        dim && !lit ? "opacity-30" : "",
        className,
      )}
    >
      <SemanticIcon
        concept="object"
        label={label}
        className={cn(
          "shrink-0 text-text-muted",
          dense ? "h-2.5 w-2.5" : "h-3 w-3",
        )}
      />
      <span className="truncate">{name}</span>
      {figure ? (
        <span className="ml-auto shrink-0 pl-1 font-mono tabular-nums text-text-secondary">
          {figure}
        </span>
      ) : null}
    </span>
  );
}

/** The `?` token — UNKNOWN, everywhere the same: a dashed circle around a
 *  `?`, the same dash the unknown person token carries. `what` names what
 *  is unknown for assistive technology (allocation, place, period …). */
export function UnknownToken({
  what,
  className,
}: {
  what: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-dashed border-text-muted/70 px-1 font-mono text-meta leading-none text-text-muted",
        className,
      )}
      data-unknown={what}
      title={what}
    >
      <span aria-hidden>?</span>
      <span className="sr-only">{what}</span>
    </span>
  );
}
