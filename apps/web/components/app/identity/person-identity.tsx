import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { EvidenceState, type EvidenceStanding } from "@/components/app/work-world/primitives";
import { playerInitials } from "@/lib/identity/player-identity";
import { cn } from "@/lib/utils";

/**
 * THE PERSISTENT PERSON — one identity primitive for every surface
 * (premium completion mission §8, §4 of the continuation brief).
 *
 * The same professional must be recognisable in the profile, journal, calendar,
 * a conversation, a project, a team and the Living CV. What persists is the
 * PERSON — the same 4:5 portrait (or monogram), the same name, the same
 * profession line, the same state signals. What changes is the DENSITY, which
 * follows the question the surface asks:
 *
 *   glance  — "who is this?"                     portrait + name + profession
 *   work    — "who, and what is their state?"    + context · availability · standing
 *   inspect — "tell me everything"               large portrait + all of it + slot
 *
 * Not a giant card everywhere: `glance` is a single inline row that fits a
 * calendar item, a message header or a roster line. The big card
 * (`IdentityStage`) is the `inspect` density's home, not repeated.
 *
 * HONESTY. A person with no photo is still a complete, professional identity
 * (monogram on the shared fallback surface — never a synthesised face). Every
 * optional fact is simply omitted when unknown; none is ever shown as zero.
 * `standing` reuses the product's ONE evidence grammar (`EvidenceState`).
 * Presentational and i18n-agnostic: callers pass resolved strings.
 */

export type PersonDensity = "glance" | "work" | "inspect";

export interface PersonIdentityProps {
  readonly name: string;
  readonly profession?: string | null;
  readonly avatarUrl?: string | null;
  readonly initials?: string;
  /** Where they are in the work right now: "Kitchen team · Autumn menu". */
  readonly context?: string | null;
  readonly location?: string | null;
  readonly availability?: { readonly label: string; readonly live: boolean } | null;
  /** The person's current standing in the product's evidence grammar. */
  readonly standing?: { readonly state: EvidenceStanding; readonly label: string } | null;
  /** True when working right now (a presence dot on the portrait). */
  readonly working?: boolean;
  readonly density?: PersonDensity;
  /** Extra detail for `inspect`. */
  readonly children?: ReactNode;
  readonly className?: string;
}

const PORTRAIT_W: Record<PersonDensity, string> = {
  glance: "36px",
  work: "52px",
  inspect: "clamp(88px, 26vw, 128px)",
};

export function PersonIdentity({
  name,
  profession,
  avatarUrl = null,
  initials,
  context,
  location,
  availability,
  standing,
  working = false,
  density = "glance",
  children,
  className,
}: PersonIdentityProps) {
  const mono = initials ?? playerInitials(name);
  const portrait = (
    <PersonPortrait
      name={name}
      avatarUrl={avatarUrl}
      initials={mono}
      width={PORTRAIT_W[density]}
      working={working}
    />
  );

  if (density === "glance") {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)} data-testid="person-identity" data-density="glance">
        {portrait}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text-primary">{name}</span>
          {profession ? <span className="block truncate text-xs text-text-secondary">{profession}</span> : null}
        </span>
      </span>
    );
  }

  const facts = (
    <>
      {context ? <p className="font-mono text-meta uppercase tracking-label text-text-secondary">{context}</p> : null}
      {location || availability || standing ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-text-secondary">
          {location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              {location}
            </span>
          ) : null}
          {availability ? (
            <span className="inline-flex items-center gap-1.5">
              {availability.live ? <span className="live-dot" aria-hidden /> : null}
              {availability.label}
            </span>
          ) : null}
          {standing ? <EvidenceState state={standing.state} label={standing.label} /> : null}
        </div>
      ) : null}
    </>
  );

  if (density === "work") {
    return (
      <div className={cn("flex min-w-0 items-start gap-3", className)} data-testid="person-identity" data-density="work">
        {portrait}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-semibold text-text-primary">{name}</p>
          {profession ? <p className="truncate text-sm text-text-secondary">{profession}</p> : null}
          {facts}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start", className)} data-testid="person-identity" data-density="inspect">
      {portrait}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="break-words font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary sm:text-3xl">{name}</h3>
        {profession ? (
          <p className="inline-flex w-fit min-h-8 items-center rounded-full border border-ink-500 bg-ink-700/70 px-3 text-sm font-semibold text-text-primary">
            {profession}
          </p>
        ) : null}
        {facts}
        {children}
      </div>
    </div>
  );
}
