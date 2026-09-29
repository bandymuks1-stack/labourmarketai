import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

import {
  PLAYER_AVATAR_PX,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import { cn } from "@/lib/utils";

/**
 * THE IDENTITY STAGE — the person as the primary visual object of the
 * Professional Player Card (owner command 2026-09-29 §6–§8).
 *
 * WHAT IT REPLACES. A 56 px round-ish avatar beside a name and a line of
 * small text — the "2000s avatar + name + badges" pattern the owner rejected.
 * Here the portrait is large, lit and framed by the work world; the name is
 * display type; EVERY profession the person holds is named (0 / 1 / N — never
 * one "true" profession); where they are, whether they are working now, and
 * a strip of REAL facts (recorded hours, confirmed hours, days worked).
 *
 * WHAT IT IS NOT. A data source or a score. It is presentational and takes
 * only already-resolved facts from its caller (the card's labels, the
 * profile hub's reads). No rating, no percentage, no stars — the fact strip
 * carries figures the journal itself states, each with its own unit.
 *
 * SLOTS, NOT RE-IMPLEMENTATIONS. The caller keeps its own heading (`heading`)
 * and its own provenance edge (`edge`): those are pinned per surface
 * (semantic headings, "gold only as the derived provenance edge"), so the
 * stage lays them out and never re-states them.
 *
 * PORTRAIT HONESTY. A real consented photo when one exists; otherwise the
 * shared initials monogram on the canonical fallback surface. Never a
 * synthesised or placeholder face (DESIGN_SOUL §1).
 */

export interface IdentityFact {
  /** The figure, already formatted ("1 284"). */
  readonly value: string;
  /** Its unit/meaning in words ("val. užfiksuota"). */
  readonly label: string;
  /** Visual role: recorded work is evidence (cyan); confirmed is trust green. */
  readonly tone: "evidence" | "confirmed" | "neutral";
  readonly testid: string;
}

const FACT_TONE: Record<IdentityFact["tone"], string> = {
  evidence: "text-brand-cyan",
  // Confirmation colour lives ONLY in the provenance edge (person-card
  // family rule); the confirmed figure is said in words, in plain ink.
  confirmed: "text-text-primary",
  neutral: "text-text-primary",
};

export function IdentityStage({
  name,
  avatarUrl,
  initials,
  edge,
  heading,
  eyebrow,
  professions,
  location,
  availability,
  currentWork,
  currentWorkLabel,
  facts = [],
  trailing,
  children,
  avatarTestids = { photo: "identity-stage-photo", monogram: "identity-stage-monogram" },
}: {
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly initials: string;
  /** The caller's provenance edge (a vertical rule beside the portrait). */
  readonly edge?: ReactNode;
  /** The caller's own heading element carrying the name. */
  readonly heading: ReactNode;
  readonly eyebrow?: ReactNode;
  /** Every profession, already resolved to display names. May be empty. */
  readonly professions: readonly string[];
  readonly location: string | null;
  readonly availability: { readonly label: string; readonly live: boolean } | null;
  /** Organizations the person works for NOW (current engagements only). */
  readonly currentWork: readonly string[];
  readonly currentWorkLabel: string;
  readonly facts?: readonly IdentityFact[];
  /** Right-hand element on wide screens (e.g. the readiness ring). */
  readonly trailing?: ReactNode;
  /** Lines under the identity (provenance words, status). */
  readonly children?: ReactNode;
  readonly avatarTestids?: { readonly photo: string; readonly monogram: string };
}) {
  const px = PLAYER_AVATAR_PX.portrait;
  return (
    <div
      className="identity-stage relative isolate overflow-hidden rounded-2xl border border-ink-600 bg-surface-1/60 p-4 sm:p-6"
      data-testid="identity-stage"
      data-professions={professions.length}
    >
      {/* The environment: a soft light from where the portrait stands and a
          faint horizon line — depth, not decoration; no particles, no blobs. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_70%_at_12%_18%,rgb(var(--c-brand-cyan)/0.10),transparent_62%)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-ink-900/70 to-transparent"
      />

      {/* Phone: the portrait sits BESIDE the name and the details run full
          width below; wider: the portrait holds its own column. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-4 sm:gap-x-6">
        {/* ── THE PERSON ───────────────────────────────────────────────── */}
        <div className="flex items-stretch gap-3 sm:row-span-2">
          {edge}
          <div
            className="identity-portrait relative shrink-0 overflow-hidden rounded-xl"
            style={{ width: `clamp(84px, 26vw, ${px}px)`, aspectRatio: "4 / 5" }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={name}
                data-testid={avatarTestids.photo}
                loading="lazy"
                className={cn("h-full w-full object-cover", PLAYER_IDENTITY_AVATAR_BORDER, "rounded-xl")}
              />
            ) : (
              <span
                aria-hidden
                data-testid={avatarTestids.monogram}
                className={cn(
                  "flex h-full w-full items-center justify-center rounded-xl font-display text-3xl font-bold tracking-tightest sm:text-6xl",
                  PLAYER_IDENTITY_FALLBACK_SURFACE,
                  PLAYER_IDENTITY_AVATAR_BORDER,
                )}
              >
                {initials}
              </span>
            )}
            {/* A lit edge on the portrait — the premium lighting treatment. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 rounded-b-xl bg-gradient-to-t from-ink-900/60 to-transparent"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-ink-500/60"
            />
          </div>
        </div>

        {/* ── WHO, WHAT, WHERE, NOW ───────────────────────────────────── */}
        <div className="flex min-w-0 items-start justify-between gap-3 self-center sm:self-start">
            <div className="flex min-w-0 flex-col gap-1">
              {eyebrow}
              {heading}
            </div>
            {trailing ? <div className="shrink-0">{trailing}</div> : null}
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-3 sm:col-span-1 sm:col-start-2">

          {professions.length > 0 ? (
            <ul
              className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
              data-testid="identity-stage-professions"
            >
              {professions.map((p, i) => (
                <li
                  key={`${p}-${i}`}
                  className={cn(
                    "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-sm",
                    i === 0
                      ? "border-ink-500 bg-ink-700/70 font-semibold text-text-primary"
                      : "border-ink-600 bg-ink-800/60 text-text-secondary",
                  )}
                >
                  {p}
                </li>
              ))}
            </ul>
          ) : null}

          {(location || availability || currentWork.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
              {currentWork.length > 0 ? (
                <span
                  className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"
                  data-testid="identity-stage-current-work"
                >
                  <span className="live-dot" aria-hidden />
                  <span className="whitespace-nowrap font-mono text-meta uppercase tracking-label text-text-muted">
                    {currentWorkLabel}
                  </span>
                  <span className="min-w-0 break-words font-medium text-text-primary">
                    {currentWork.join(" · ")}
                  </span>
                </span>
              ) : null}
              {location ? (
                <span className="inline-flex items-center gap-1.5" data-testid="identity-stage-location">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  {location}
                </span>
              ) : null}
              {availability ? (
                <span className="inline-flex items-center gap-1.5" data-testid="identity-stage-availability">
                  {availability.live ? <span className="live-dot" aria-hidden /> : null}
                  {availability.label}
                </span>
              ) : null}
            </div>
          )}

          {children}

          {facts.length > 0 ? (
            <dl
              className="mt-auto grid grid-cols-3 gap-2 border-t border-ink-600/70 pt-3 sm:gap-4"
              data-testid="identity-stage-facts"
            >
              {facts.map((f) => (
                <div key={f.testid} className="flex min-w-0 flex-col gap-0.5" data-testid={f.testid}>
                  <dt className="order-2 truncate font-mono text-[0.625rem] uppercase tracking-label text-text-muted sm:text-meta">
                    {f.label}
                  </dt>
                  <dd
                    className={cn(
                      "order-1 font-display text-2xl font-bold leading-none tracking-tightest tabular-nums sm:text-3xl",
                      FACT_TONE[f.tone],
                    )}
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}
