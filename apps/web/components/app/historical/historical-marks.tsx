import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import { objectMonogram } from "@/lib/organization-evidence/import-visual";
import { cn } from "@/lib/utils";

/**
 * THE TWO MARKS every historical view is drawn with (LABOURMARKET_VISUAL_FIRST
 * constitution, owner correction 2026-09-17: "avatar / person, time position,
 * place / work marker and duration should communicate the state visually;
 * codes / legends are secondary").
 *
 *   PersonMark   the ONE identity tile — the canonical monogram on the
 *                canonical surface, in four sizes. Never a synthesised face.
 *   PlaceMark    a place as a place: the location glyph and the NAME. The
 *                monogram (`T3`) exists only as a tooltip / accessible
 *                detail — it is not the information architecture.
 *
 * Pure presentation; no client directive so both server and client trees
 * can use them.
 */

const TILE = cn("inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold leading-none", PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE);

const SIZE = {
  xs: "h-5 w-5 text-meta",
  sm: "h-7 w-7 text-meta",
  md: "h-10 w-10 text-support",
  lg: "h-14 w-14 text-card-title",
  xl: "h-24 w-24 text-title-lg",
} as const;

export function PersonMark({
  label,
  size = "md",
  lit,
  className,
}: {
  label: string;
  size?: keyof typeof SIZE;
  /** Selected / highlighted: the gold ring. */
  lit?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      title={label}
      data-person-mark={label}
      className={cn(TILE, SIZE[size], lit ? "ring-2 ring-brand-blue ring-offset-1 ring-offset-ink-900" : "", className)}
    >
      {playerInitials(label)}
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
        lit ? "border-brand-blue bg-brand-blue/15 text-text-primary" : "border-ink-600 bg-ink-800/70 text-text-primary",
        dim && !lit ? "opacity-30" : "",
        className,
      )}
    >
      <SemanticIcon concept="object" label={label} className={cn("shrink-0 text-text-muted", dense ? "h-2.5 w-2.5" : "h-3 w-3")} />
      <span className="truncate">{name}</span>
      {figure ? <span className="ml-auto shrink-0 pl-1 font-mono tabular-nums text-text-secondary">{figure}</span> : null}
    </span>
  );
}
