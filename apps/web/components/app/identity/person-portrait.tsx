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
 * frame, the same lit edge, the same monogram surface when there is no
 * consented photo. Surfaces differ only in `size`; the person never changes
 * shape. (Premium completion mission §8: "the person is persistent, the
 * context changes.")
 *
 * HONESTY. A real consented photo when one exists; otherwise initials on the
 * canonical fallback surface. Never a synthesised face (DESIGN_SOUL §1).
 * `state` is an optional presence dot (working now) — a fact the caller holds,
 * never decoration.
 */
export function PersonPortrait({
  name,
  avatarUrl,
  initials,
  width,
  working = false,
  testids,
  className,
  shape = "frame",
  lit = false,
}: {
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly initials: string;
  /** CSS width of the frame, e.g. "40px" or "clamp(96px, 30vw, 224px)". */
  readonly width: string;
  readonly working?: boolean;
  readonly testids?: { readonly photo: string; readonly monogram: string };
  readonly className?: string;
  /** `frame` is the persistent 4:5 portrait; `round` is the same person at
   *  shell size (1:1) for the header and menus — same edge, same monogram. */
  readonly shape?: "frame" | "round";
  /** The person in focus: a gold-lit edge, matching `PersonRing focus`. */
  readonly lit?: boolean;
}) {
  const round = shape === "round";
  const radius = round ? "rounded-full" : "rounded-xl";
  return (
    <span
      className={cn(
        "identity-portrait relative inline-block shrink-0 overflow-hidden",
        radius,
        lit && "shadow-[0_0_0_1px_rgb(var(--c-brand-blue)/0.55),0_0_28px_rgb(var(--c-brand-blue)/0.18)]",
        className,
      )}
      style={{ width, aspectRatio: round ? "1 / 1" : "4 / 5" }}
      data-testid="person-portrait"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          data-testid={testids?.photo}
          loading="lazy"
          className={cn("h-full w-full object-cover", radius, PLAYER_IDENTITY_AVATAR_BORDER)}
        />
      ) : (
        <span
          aria-hidden
          data-testid={testids?.monogram}
          className={cn(
            "flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-600 to-ink-800 font-display font-semibold tracking-tightest",
            radius,
            PLAYER_IDENTITY_FALLBACK_SURFACE,
            PLAYER_IDENTITY_AVATAR_BORDER,
          )}
          style={{ fontSize: `calc(${width} * ${round ? "0.38" : "0.34"})` }}
        >
          {initials}
        </span>
      )}
      {round ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-xl bg-gradient-to-t from-ink-900/60 to-transparent"
        />
      )}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 ring-1 ring-inset shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]",
          radius,
          lit ? "ring-brand-blue/40" : "ring-ink-500/60",
        )}
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
