"use client";

import { useIdentityFamily } from "@/components/app/identity/identity-family-context";
import { FIGURE_MIN_PX, PersonFigure, personToneKey, plate } from "@/components/app/identity/identity-family";
import {
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import { cn } from "@/lib/utils";

/**
 * THE PERSISTENT PERSON — one portrait, every surface.
 *
 * A professional seen in the card, a roster, a conversation, the calendar, a
 * team or the journal must be the SAME recognisable person: the same 4:5
 * frame, the same lit edge, the same plate and monogram when there is no
 * consented photo. Surfaces differ only in `size`; the person never changes
 * shape. (Premium completion mission §8: "the person is persistent, the
 * context changes.")
 *
 * ONE FAMILY (D2, 2026-10-14). This is the CARD/STAGE silhouette of the
 * identity family (`identity-family.tsx`): a person without a photo is the
 * family's tonal plate (theme tokens, chosen from the name) with the
 * person's initials, and — where the frame is large enough to read it — the
 * frozen engraved figure, faintly, behind them. The canonical fallback
 * surface stays as the underlay.
 *
 * OPT-IN. The plate renders only beneath `IdentityFamilyProvider` (the
 * signed-in dashboard layout). Without it — the frozen public landing — the
 * portrait renders main's legacy monogram tile unchanged (owner, 2026-10-14).
 *
 * HONESTY. A real consented photo when one exists; otherwise initials on the
 * plate. Never a synthesised face (DESIGN_SOUL §1). `working` is an optional
 * presence dot (working now) — a fact the caller holds, never decoration.
 */
export function PersonPortrait({
  name,
  avatarUrl,
  initials,
  width,
  working = false,
  testids,
  className,
}: {
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly initials: string;
  /** CSS width of the 4:5 frame, e.g. "40px" or "clamp(96px, 30vw, 224px)". */
  readonly width: string;
  readonly working?: boolean;
  readonly testids?: { readonly photo: string; readonly monogram: string };
  readonly className?: string;
}) {
  const family = useIdentityFamily();
  // The SAME plate as the person's chip/row mark (`personToneKey`).
  const key = personToneKey(name, initials);
  // A fixed small frame ("40px", "3.5rem") has no room for the figure; a
  // fluid stage frame (clamp/vw) always does.
  const fixed = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(width);
  const fixedPx = fixed ? Number(fixed[1]) * (fixed[2] === "rem" ? 16 : 1) : null;
  const showFigure = fixedPx === null || fixedPx >= FIGURE_MIN_PX;
  return (
    <span
      className={cn("identity-portrait relative inline-block shrink-0 overflow-hidden rounded-xl", className)}
      style={{ width, aspectRatio: "4 / 5" }}
      data-testid="person-portrait"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          data-testid={testids?.photo}
          loading="lazy"
          className={cn("h-full w-full rounded-xl object-cover", PLAYER_IDENTITY_AVATAR_BORDER)}
        />
      ) : !family ? (
        // LEGACY (no provider): main's monogram tile, unchanged.
        <span
          aria-hidden
          data-testid={testids?.monogram}
          className={cn(
            "flex h-full w-full items-center justify-center rounded-xl font-display font-bold tracking-tightest",
            PLAYER_IDENTITY_FALLBACK_SURFACE,
            PLAYER_IDENTITY_AVATAR_BORDER,
          )}
          style={{ fontSize: `calc(${width} * 0.36)` }}
        >
          {initials}
        </span>
      ) : (
        <span
          aria-hidden
          data-testid={testids?.monogram}
          data-identity="person-fallback"
          className={cn(
            "relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl font-display font-semibold tracking-tightest",
            PLAYER_IDENTITY_FALLBACK_SURFACE,
            PLAYER_IDENTITY_AVATAR_BORDER,
          )}
          style={{ background: plate(key), fontSize: `calc(${width} * ${showFigure ? 0.26 : 0.36})` }}
        >
          {showFigure ? <PersonFigure id={key} /> : null}
          <span
            className={cn(
              "leading-none text-[rgb(var(--c-identity-figure)/0.88)]",
              showFigure && "absolute inset-x-0 flex items-end justify-center",
            )}
            style={showFigure ? { top: "56%", bottom: "8%" } : undefined}
          >
            {initials}
          </span>
        </span>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-xl bg-gradient-to-t from-ink-900/60 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-ink-500/60"
      />
      {working ? (
        <span
          role="img"
          aria-label="working now"
          className="live-dot absolute bottom-1.5 right-1.5 ring-2 ring-ink-900"
        />
      ) : null}
    </span>
  );
}
