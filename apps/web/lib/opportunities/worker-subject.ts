import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourceToEvidence,
  type EvidenceTier,
  type MatchSubject,
} from "@/lib/market/match-v1";

/**
 * The signed-in worker's OWN match subject (Worker Express Interest slice).
 * One builder shared by the opportunity board loader and the interest flow —
 * slug identity, REAL evidence tiers, RLS own-rows only. Never fabricates.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface OwnWorkerContext {
  readonly workerId: string;
  readonly subject: MatchSubject;
  /** Raw own worker_skills row count (readiness uses rows, not unique slugs). */
  readonly skillRowCount: number;
  readonly worker: {
    readonly availability_status: string | null;
    readonly available_from: string | null;
    readonly current_location_country: string | null;
  };
}

export async function buildOwnWorkerContext(
  supabase: SupabaseClient,
  profileId: string,
): Promise<OwnWorkerContext | null> {
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select(
      "id, availability_status, available_from, current_location_country, preferred_countries, preferred_contract_type",
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!worker) return null;
  const workerId = worker.id as string;

  const [{ data: skillRows }, { data: prof }, prefLocRes] = await Promise.all([
    asAny(supabase)
      .from("worker_skills")
      .select("id, source, verified, skills ( slug )")
      .eq("worker_id", workerId),
    asAny(supabase)
      .from("worker_professions")
      .select("professions(slug)")
      .eq("worker_id", workerId)
      .eq("is_primary", true)
      .maybeSingle(),
    // OWN preferred locations (own-rows RLS, §20 — never readable by
    // employers). City feeds the worker-side city tier of the match engine;
    // the table may not exist in every environment → graceful null.
    asAny(supabase)
      .from("preferred_locations")
      .select("city, country_code, priority, active")
      .eq("profile_id", profileId)
      .eq("active", true)
      .order("priority", { ascending: true })
      .then(
        (r: { data: unknown }) => r,
        () => ({ data: null }),
      ),
  ]);

  const professionSlug: string | null =
    ((prof?.professions ?? null) as { slug: string | null } | null)?.slug ?? null;

  const tierRank: Record<EvidenceTier, number> = {
    self_declared: 0,
    work_journal: 1,
    manager_confirmed: 2,
  };
  const ownSkillTiers = new Map<string, EvidenceTier>();
  for (const s of (skillRows ?? []) as {
    source: string | null;
    verified: boolean | null;
    skills: { slug: string | null } | null;
  }[]) {
    const slug = s.skills?.slug;
    if (!slug) continue;
    const tier: EvidenceTier = s.verified ? "manager_confirmed" : sourceToEvidence(s.source);
    const prev = ownSkillTiers.get(slug);
    if (!prev || tierRank[tier] > tierRank[prev]) ownSkillTiers.set(slug, tier);
  }

  const country = worker.current_location_country
    ? String(worker.current_location_country).toUpperCase()
    : null;

  // Preferred locations (own rows): first active city by priority + the
  // union of preferred country codes (workers column ∪ preferred rows).
  const prefRows = ((prefLocRes?.data ?? []) as {
    city: string | null;
    country_code: string | null;
  }[]);
  const preferredCity =
    prefRows.map((r) => (r.city ?? "").trim()).find((c) => c !== "") ?? null;
  const preferredCountries = [
    ...new Set(
      [
        ...(((worker.preferred_countries as string[] | null) ?? []) as string[]),
        ...prefRows
          .map((r) => (r.country_code ?? "").trim().toUpperCase())
          .filter((c) => c !== ""),
      ].map((c) => c.toUpperCase()),
    ),
  ];

  return {
    workerId,
    skillRowCount: (skillRows ?? []).length,
    worker: {
      availability_status: (worker.availability_status as string | null) ?? null,
      available_from: (worker.available_from as string | null) ?? null,
      current_location_country: country,
    },
    subject: {
      skills: [...ownSkillTiers.entries()].map(([uri, evidence]) => ({ uri, evidence })),
      professionSlug,
      country,
      city: preferredCity,
      preferredCountries,
      availabilityStatus: (worker.availability_status as string | null) ?? null,
      availableFrom: (worker.available_from as string | null) ?? null,
      // Contract v2 — engagement-form criterion (fires only when the demand
      // also states its engagement form via structured_v2).
      preferredContractType: (worker.preferred_contract_type as string | null) ?? null,
    },
  };
}
