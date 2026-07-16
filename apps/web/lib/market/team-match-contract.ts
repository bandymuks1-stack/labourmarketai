/**
 * CANONICAL TEAM MATCH INPUT CONTRACT (integration control addendum,
 * 2026-07-16) — shared between Wagon 2 (canonical team read model, separate
 * branch) and Wagon 4 (explainable matching).
 *
 * Field names are FROZEN by the owner directive — Wagon 2's read model
 * returns exactly this shape and `matchTeamToNeed` consumes it as its
 * team-side input. Do not rename, widen, or "improve" fields here without a
 * cross-wagon decision.
 *
 * Semantics (binding): null / "unknown" / [] mean NOT STATED. The matching
 * layer must surface them as missing facts — NEVER as matches or mismatches.
 * `certificationCoverage: null` = not derivable — treat as UNKNOWN, never as
 * satisfied.
 *
 * Pure type module: no IO, no zod (the read model owns validation).
 */

export interface TeamMatchInputV1 {
  readonly teamId: string;
  readonly activeMemberCount: number;
  readonly deployableSize: { readonly min: number | null; readonly max: number | null };
  readonly professionComposition: ReadonlyArray<{
    readonly slug: string;
    readonly memberCount: number;
  }>;
  readonly skillComposition: ReadonlyArray<{
    readonly slug: string;
    readonly membersDeclared: number;
    readonly membersConfirmed: number;
  }>;
  readonly languageComposition: ReadonlyArray<{
    readonly code: string;
    readonly level: string | null;
    readonly memberCount: number;
  }>;
  /** null = not derivable — treat as UNKNOWN, never as satisfied. */
  readonly certificationCoverage: ReadonlyArray<{
    readonly slug: string;
    readonly memberCount: number;
  }> | null;
  readonly availability: {
    readonly status: "available_now" | "available_from" | "not_available" | "unknown";
    readonly availableFrom: string | null;
  };
  readonly destinationCountries: readonly string[] | null;
  readonly accommodationNeeded: boolean | null;
  readonly transport: { readonly ownTransport: boolean | null };
  readonly memberConsentCompleteness: {
    readonly consentedMembers: number;
    readonly totalMembers: number;
  };
  readonly dataFreshness: {
    readonly updatedAt: string | null;
    readonly bucket: "active" | "recent" | "dormant" | "unknown";
  };
  readonly visibilityState: "private" | "members_only" | "discoverable" | "unknown";
}

/** An all-unknown contract value for adapters that can only prove identity +
 *  member count (every other fact stays an honest "not stated"). */
export function emptyTeamMatchInput(
  teamId: string,
  activeMemberCount: number,
): TeamMatchInputV1 {
  return {
    teamId,
    activeMemberCount,
    deployableSize: { min: null, max: null },
    professionComposition: [],
    skillComposition: [],
    languageComposition: [],
    certificationCoverage: null,
    availability: { status: "unknown", availableFrom: null },
    destinationCountries: null,
    accommodationNeeded: null,
    transport: { ownTransport: null },
    memberConsentCompleteness: { consentedMembers: 0, totalMembers: activeMemberCount },
    dataFreshness: { updatedAt: null, bucket: "unknown" },
    visibilityState: "unknown",
  };
}
