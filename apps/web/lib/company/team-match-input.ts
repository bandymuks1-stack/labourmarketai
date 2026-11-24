import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readInvitationLedger, readTeamDetails } from "./team-brigades";

/**
 * CANONICAL TEAM MATCH INPUT (Trust Connect Teams v1 — integration
 * addendum). Wagon 4 CONSUMES this read model; this wagon OWNS it. The shape
 * is specified in docs/launch/team-match-input-contract-v1.md and must not
 * drift without a contract-doc version bump.
 *
 * Honesty rule: every field is derived from real applied schema (or the
 * draft-gated team_details migration 20260716130000) or is explicitly
 * null / 'unknown' / []. Nothing is ever invented:
 *   - certificationCoverage is null — no structured certification slugs
 *     exist in the applied schema today;
 *   - languageComposition is [] when worker_languages is unreadable;
 *   - availability is 'unknown' + nulls while team_details is unapplied or
 *     unfilled;
 *   - visibilityState is 'discoverable' because the APPLIED organizations
 *     SELECT policy (0013, using(true)) makes every org row — teams
 *     included — readable to authenticated users via the network search.
 */

export type TeamMatchInputV1 = {
  teamId: string;
  activeMemberCount: number;
  deployableSize: { min: number | null; max: number | null };
  professionComposition: Array<{ slug: string; memberCount: number }>;
  /** null = the gated capability summary did not answer (see the contract in
   *  lib/market/team-match-contract.ts). `[]` = it answered with nothing. */
  skillComposition: Array<{
    slug: string;
    membersDeclared: number;
    membersConfirmed: number;
  }> | null;
  languageComposition: Array<{
    code: string;
    level: string | null;
    memberCount: number;
  }>;
  certificationCoverage: Array<{ slug: string; memberCount: number }> | null;
  availability: {
    status: "available_now" | "available_from" | "not_available" | "unknown";
    availableFrom: string | null;
  };
  destinationCountries: string[] | null;
  accommodationNeeded: boolean | null;
  transport: { ownTransport: boolean | null };
  memberConsentCompleteness: {
    consentedMembers: number;
    totalMembers: number;
  };
  dataFreshness: {
    updatedAt: string | null;
    bucket: "active" | "recent" | "dormant" | "unknown";
  };
  visibilityState: "private" | "members_only" | "discoverable" | "unknown";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function freshnessBucket(
  updatedAt: string | null,
): TeamMatchInputV1["dataFreshness"]["bucket"] {
  if (!updatedAt) return "unknown";
  const ageMs = Date.now() - Date.parse(updatedAt);
  if (!Number.isFinite(ageMs)) return "unknown";
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < 7 * day) return "active";
  if (ageMs < 30 * day) return "recent";
  return "dormant";
}

/**
 * Build the canonical match input for ONE team. Returns null only when the
 * team org row itself is not a readable team; every downstream layer
 * degrades to honest empties/unknowns instead of failing.
 */
export async function buildTeamMatchInput(
  teamId: string,
): Promise<TeamMatchInputV1 | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: orgRow, error: orgError } = await asAny(supabase)
    .from("organizations")
    .select("id, organization_type")
    .eq("id", teamId)
    .eq("organization_type", "team")
    .maybeSingle();
  if (orgError || !orgRow) return null;

  // Active members via the canonical engagement spine.
  const { data: ecRows } = await asAny(supabase)
    .from("engagement_contexts")
    .select("profile_id")
    .eq("organization_id", teamId)
    .eq("relationship_slug", "employee")
    .eq("status", "active");
  const profileIds = ((ecRows ?? []) as { profile_id: string | null }[])
    .map((r) => r.profile_id)
    .filter((p): p is string => p !== null);
  const totalMembers = profileIds.length;

  // Member worker rows (RLS-scoped; unreadable members simply drop out of
  // the derived compositions — never invented).
  let workerIds: string[] = [];
  if (profileIds.length > 0) {
    const { data: workerRows } = await asAny(supabase)
      .from("workers")
      .select("id, profile_id")
      .in("profile_id", profileIds);
    workerIds = ((workerRows ?? []) as { id: string }[]).map((w) => w.id);
  }

  // Profession composition from the applied worker_professions spine.
  const professionCounts = new Map<string, Set<string>>();
  if (workerIds.length > 0) {
    const { data: profRows, error: profError } = await asAny(supabase)
      .from("worker_professions")
      .select("worker_id, professions(slug)")
      .in("worker_id", workerIds);
    if (!profError) {
      for (const r of (profRows ?? []) as {
        worker_id: string | null;
        professions: unknown;
      }[]) {
        const p = (Array.isArray(r.professions) ? r.professions[0] : r.professions) as
          | { slug: string | null }
          | null;
        if (!r.worker_id || !p?.slug) continue;
        const set = professionCounts.get(p.slug) ?? new Set<string>();
        set.add(r.worker_id);
        professionCounts.set(p.slug, set);
      }
    }
  }

  // Skill composition from the gated capability summary (honest counts).
  //
  // A REFUSAL AND A FAILURE ARE NOT AN EMPTY TEAM. This started as `= []` with
  // the read's outcome discarded, so a failed RPC produced the same value as a
  // team whose members have declared nothing — and any consumer could iterate
  // that array and report zero capability. It now starts NOT READABLE and only
  // becomes an array when the read actually answered. The unauthorized case
  // still arrives as zero rows by design (the RPC does not confirm a team's
  // existence to a stranger), which is why an empty composition is a missing
  // fact downstream and never a zero.
  let skillComposition: TeamMatchInputV1["skillComposition"] = null;
  {
    const { data, error } = await asAny(supabase).rpc(
      "get_team_capability_summary_v1",
      { p_org_id: teamId },
    );
    if (!error && Array.isArray(data)) {
      skillComposition = (data as {
        skill_slug: string | null;
        members_declared: number | null;
        members_confirmed: number | null;
      }[])
        .filter((r) => typeof r.skill_slug === "string" && r.skill_slug.length > 0)
        .map((r) => ({
          slug: r.skill_slug as string,
          membersDeclared: r.members_declared ?? 0,
          membersConfirmed: r.members_confirmed ?? 0,
        }));
    }
  }

  // Language composition from worker_languages when reachable; else [].
  const languageCounts = new Map<string, Set<string>>();
  if (workerIds.length > 0) {
    const { data: langRows, error: langError } = await asAny(supabase)
      .from("worker_languages")
      .select("worker_id, lang, level")
      .in("worker_id", workerIds);
    if (!langError) {
      for (const r of (langRows ?? []) as {
        worker_id: string | null;
        lang: string | null;
        level: string | null;
      }[]) {
        if (!r.worker_id || !r.lang) continue;
        const key = `${r.lang}\u0000${r.level ?? ""}`;
        const set = languageCounts.get(key) ?? new Set<string>();
        set.add(r.worker_id);
        languageCounts.set(key, set);
      }
    }
  }

  // Team-scoped details (draft-gated 20260716130000) — unknown while
  // unapplied/unfilled.
  const details = (await readTeamDetails(supabase, [teamId])).byTeam.get(teamId) ?? null;

  // Consent completeness from the real invitations ledger (inviter-or-admin
  // read). When the ledger is unreadable, ZERO recorded consents is the
  // truth — nothing is assumed.
  const ledger = await readInvitationLedger(supabase, [teamId]);
  const acceptedSet = ledger.acceptedByTeam.get(teamId);
  const consentedMembers = profileIds.filter((p) => acceptedSet?.has(p) ?? false)
    .length;

  return {
    teamId,
    activeMemberCount: totalMembers,
    deployableSize: {
      min: details?.deployableSizeMin ?? null,
      max: details?.deployableSizeMax ?? null,
    },
    professionComposition: [...professionCounts.entries()]
      .map(([slug, set]) => ({ slug, memberCount: set.size }))
      .sort((a, b) => b.memberCount - a.memberCount),
    skillComposition,
    languageComposition: [...languageCounts.entries()]
      .map(([key, set]) => {
        const [code, level] = key.split("\u0000");
        return { code, level: level === "" ? null : level, memberCount: set.size };
      })
      .sort((a, b) => b.memberCount - a.memberCount),
    // No structured certification data exists in the applied schema — null,
    // never an invented coverage list.
    certificationCoverage: null,
    availability: {
      status: details?.availabilityStatus ?? "unknown",
      availableFrom: details?.availableFrom ?? null,
    },
    destinationCountries: details?.destinationCountries
      ? [...details.destinationCountries]
      : null,
    accommodationNeeded: details ? details.accommodationNeeded : null,
    transport: { ownTransport: details ? details.transportOwn : null },
    memberConsentCompleteness: { consentedMembers, totalMembers },
    dataFreshness: {
      updatedAt: details?.updatedAt ?? null,
      bucket: freshnessBucket(details?.updatedAt ?? null),
    },
    // Policy fact: a team stays findable by name through the invitation
    // directory (`search_organizations_directory_v1`, 20260802170000), so
    // 'discoverable' remains accurate. What changed in W9 slice 2 is that the
    // full org ROW is no longer readable to every authenticated user — this
    // builder's only caller is the requireSuperadmin matching workbench, which
    // reads it through the admin arm of `organizations_select`. If a real
    // visibility column ever lands, derive from it instead.
    visibilityState: "discoverable",
  };
}
