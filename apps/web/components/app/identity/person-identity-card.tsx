import type { ComponentProps, ReactNode } from "react";
import { MapPin, Compass, Briefcase, ChevronRight } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { cn } from "@/lib/utils";

/**
 * THE PERSON-IDENTITY CARD — one professional identity, different depth by
 * context (owner order 2026-10-01).
 *
 * The identity travels with the person: personal card → application →
 * candidate search → shortlist → company → team → project → assignment →
 * calendar. What changes between those places is HOW MUCH is opened, never
 * what the person looks like. This component is the compact, list-friendly
 * depth of the SAME identity vocabulary `IdentityStage` (the full portrait
 * stage of the personal card) is built on: the same monogram source, the same
 * fallback surface, the same hairline, the same ink/ivory tokens.
 *
 *   LAYER 1  always visible  — portrait, name, main profession, place and
 *                              mobility, availability, a few facts the context
 *                              cares about (`chips`), the context's status.
 *   LAYER 2+ disclosure      — `IdentityDisclosure` groups, closed by
 *                              default, native <details> (no JS, no motion).
 *   ACTIONS  always reachable — `actions` slot, where the caller's own
 *                              authorization already decides what renders.
 *
 * WHAT IT IS NOT. A data source, a score or a second Living CV. It takes
 * already-resolved, already-authorized facts from its caller; it never reads,
 * never ranks, never shows a percentage, stars or a trust figure. A CV/PDF is
 * an export of the same identity, not a different one.
 *
 * PORTRAIT HONESTY. A real consented photo when the caller has one;
 * otherwise the shared initials monogram. Never a synthesised face.
 */

export interface IdentityMeta {
  readonly key: string;
  readonly kind: "location" | "mobility" | "availability" | "assignment" | "role";
  readonly label: string;
  /** A live dot beside the label — available / working now. */
  readonly live?: boolean;
}

const META_ICON = {
  location: MapPin,
  mobility: Compass,
  assignment: Briefcase,
  role: Briefcase,
} as const;

export function PersonIdentityCard({
  variant,
  testid,
  name,
  initials,
  avatarUrl = null,
  nameHref,
  professions,
  meta,
  chips,
  status,
  children,
  actions,
  dataAttrs,
  density = "full",
}: {
  /** `compact` = a row-sized identity (calendar day, assignment, roster):
   *  same atoms, smaller portrait, quieter name. Default `full`. */
  readonly density?: "full" | "compact";
  /** Which depth/context this card renders — carried as `data-identity`. */
  readonly variant: "candidate-review" | "team-member" | "assignment" | "roster-person";
  readonly testid: string;
  /** The name — or, where the person has not allowed it yet, the honest
   *  anonymized handle the caller resolved. Already display-ready. */
  readonly name: string;
  readonly initials: string;
  readonly avatarUrl?: string | null;
  /** When set, the name opens the person (the caller's own, already-authorized route). */
  readonly nameHref?: ComponentProps<typeof Link>["href"];
  /** Main profession first. May be empty (0 / 1 / N). */
  readonly professions: readonly string[];
  readonly meta: readonly IdentityMeta[];
  /** A few facts relevant to THIS context (vacancy / project). Caller-made. */
  readonly chips?: ReactNode;
  /** Context status at the top right (pipeline stage, role, review state). */
  readonly status?: ReactNode;
  /** Disclosure layers (`IdentityDisclosure`). */
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly dataAttrs?: Readonly<Record<string, string>>;
}) {
  return (
    <article
      className="identity-card flex flex-col gap-3"
      data-testid={testid}
      data-identity={variant}
      {...dataAttrs}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* THE PERSISTENT PORTRAIT: the SAME 4:5 frame as IdentityStage at every
            density — only its size changes (it used to be a 1:1 square when
            compact, so the person changed shape between surfaces). */}
        <span
          className={cn(
            "shrink-0 rounded-xl",
            density === "full" && "shadow-[0_0_0_2px_rgb(var(--c-brand-blue)/0.45),0_0_28px_rgb(var(--c-brand-blue)/0.16)]",
          )}
        >
          <PersonPortrait
            name={name}
            avatarUrl={avatarUrl}
            initials={initials}
            width={density === "compact" ? "40px" : "clamp(72px, 22vw, 104px)"}
            testids={{ photo: "identity-card-photo", monogram: "identity-card-monogram" }}
            className="identity-card-portrait"
          />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3
              className={cn(
                "min-w-0 font-display font-bold leading-tight tracking-tightest text-text-primary [overflow-wrap:anywhere]",
                density === "compact" ? "text-sm" : "text-xl",
              )}
              data-testid="identity-card-name"
            >
              {nameHref ? (
                <Link href={nameHref} className="hover:text-brand-blue" data-testid="identity-card-name-link">
                  {name}
                </Link>
              ) : (
                name
              )}
            </h3>
            {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
          </div>

          {professions.length > 0 ? (
            <p
              className={cn("text-text-secondary", density === "compact" ? "text-xs" : "text-sm")}
              data-testid="identity-card-professions"
            >
              <span className={cn(density === "compact" ? "font-normal" : "font-semibold text-text-primary")}>
                {professions[0]}
              </span>
              {professions.length > 1 ? (
                <span className="text-text-muted"> · {professions.slice(1).join(" · ")}</span>
              ) : null}
            </p>
          ) : null}

          {meta.length > 0 ? (
            <ul
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary"
              data-testid="identity-card-meta"
            >
              {meta.map((m) => {
                const Icon = m.kind === "availability" ? null : META_ICON[m.kind];
                return (
                  <li key={m.key} className="inline-flex min-w-0 items-center gap-1.5" data-meta={m.kind}>
                    {m.live ? <span className="live-dot" aria-hidden /> : null}
                    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> : null}
                    <span className="min-w-0 break-words">{m.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>

      {chips ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="identity-card-chips">
          {chips}
        </div>
      ) : null}

      {children ? (
        <div className="flex flex-col divide-y divide-ink-600/50 rounded-xl bg-surface-1/40 shadow-[0_0_0_1px_rgb(var(--c-ink-600)/0.6)]">
          {children}
        </div>
      ) : null}

      {actions}
    </article>
  );
}

/**
 * ONE disclosure layer. Native <details>: keyboard and screen-reader
 * operable with no script, and no animation at all, so reduced-motion is
 * satisfied by construction. Closed by default — depth is opt-in.
 */
export function IdentityDisclosure({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  readonly id: string;
  readonly title: string;
  /** One quiet line beside the title — what is inside, in words. */
  readonly summary?: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details className="group" data-testid={`identity-layer-${id}`} open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-text-primary marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        <span className="min-w-0">{title}</span>
        {summary ? (
          <span className="ml-auto min-w-0 truncate pl-2 text-xs font-normal text-text-muted">
            {summary}
          </span>
        ) : null}
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}
