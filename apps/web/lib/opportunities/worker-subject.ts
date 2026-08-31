import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPrimaryProfessionSlug,
  getWorkerCoreRow,
  getWorkerSkillRows,
  readWorkerCoreRow,
  readWorkerProfessionRows,
  readWorkerSkillRows,
  type WorkerCoreRow,
  type WorkerSkillRow,
} from "@/lib/data/worker-core";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  sourceToEvidence,
  type EvidenceTier,
  type MatchSubject,
  type WorkerLanguageFact,
} from "@/lib/market/match-v1";

/**
 * The signed-in worker's OWN match subject (Worker Express Interest slice).
 * One builder shared by the opportunity board loader and the interest flow —
 * slug identity, REAL evidence tiers, RLS own-rows only. Never fabricates.
 *
 * P0 nav-performance: the worker row (both the primary read AND the mirrored
 * contract-v2.1 facts), the skill rows (same `skills ( slug )` slug-identity
 * join — never any ESCO key) and the primary profession all come from THE
 * request-cached core readers (@/lib/data/worker-core) — this builder
 * previously issued 2 `workers`, 1 `worker_skills` and 1
 * `worker_professions` select of its own per navigation, duplicating the
 * player-card / hub reads of the same rows.
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

/** Shared row fetches that already run on an explicit client — used by both
 *  transports below. */
async function readSubjectSideRows(
  supabase: SupabaseClient,
  profileId: string,
  workerId: string,
): Promise<{ prefLocRes: { data: unknown }; langsRes: { data: unknown } }> {
  const [prefLocRes, langsRes] = await Promise.all([
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
    // MP-1 worker_languages stays FEATURE-DETECTED (human-gated table; may
    // be unapplied). Any error (42P01) → undefined facts (honest
    // missingFacts in the engine).
    asAny(supabase)
      .from("worker_languages")
      .select("lang, level")
      .eq("worker_id", workerId)
      .then(
        (r: { data: unknown; error: unknown }) => (r.error ? { data: null } : r),
        () => ({ data: null }),
      ),
  ]);
  return { prefLocRes, langsRes };
}

/**
 * G4 bridge: the SAME subject builder as an explicit caller — the
 * transport-neutral core under `buildOwnWorkerContext`. Row reads go through
 * the caller-scoped worker-core functions (no request-cache, no session);
 * the ASSEMBLY below is shared verbatim with the cookie path, so the two
 * transports can never compute different subjects from the same rows.
 */
export async function buildOwnWorkerContextCore(
  caller: DomainCaller,
): Promise<OwnWorkerContext | null> {
  const workerRead = await readWorkerCoreRow(caller);
  const worker = workerRead.ok ? workerRead.value : null;
  if (!worker || (worker.profile_id !== null && worker.profile_id !== caller.userId)) {
    return null;
  }
  const [skillsRead, professionsRead, side] = await Promise.all([
    readWorkerSkillRows(caller, worker.id),
    readWorkerProfessionRows(caller, worker.id),
    readSubjectSideRows(caller.supabase, caller.userId, worker.id),
  ]);
  const professionRows = professionsRead.ok ? professionsRead.value : [];
  return assembleOwnWorkerContext({
    worker,
    skillRows: skillsRead.ok ? skillsRead.value : [],
    professionSlug:
      professionRows.find((r) => r.is_primary === true)?.professions?.slug ?? null,
    prefLocRes: side.prefLocRes,
    langsRes: side.langsRes,
  });
}

export async function buildOwnWorkerContext(
  supabase: SupabaseClient,
  profileId: string,
): Promise<OwnWorkerContext | null> {
  // Request-cached core row (self-resolving via the session). Every caller
  // passes the signed-in user's own profile id; if a future caller ever
  // passed a different id, the mismatch degrades to an honest null instead
  // of silently returning someone else's context.
  const worker = await getWorkerCoreRow();
  if (!worker || (worker.profile_id !== null && worker.profile_id !== profileId)) {
    return null;
  }
  const workerId = worker.id;

  const [skillRows, professionSlug, side] = await Promise.all([
    getWorkerSkillRows(),
    getPrimaryProfessionSlug(),
    readSubjectSideRows(supabase, profileId, workerId),
  ]);
  return assembleOwnWorkerContext({
    worker,
    skillRows,
    professionSlug,
    prefLocRes: side.prefLocRes,
    langsRes: side.langsRes,
  });
}

/** ONE assembly for both transports — pure over the fetched rows. */
function assembleOwnWorkerContext({
  worker,
  skillRows,
  professionSlug,
  prefLocRes,
  langsRes,
}: {
  worker: WorkerCoreRow;
  skillRows: readonly WorkerSkillRow[];
  professionSlug: string | null;
  prefLocRes: { data: unknown };
  langsRes: { data: unknown };
}): OwnWorkerContext {
  const workerId = worker.id;

  const tierRank: Record<EvidenceTier, number> = {
    self_declared: 0,
    work_journal: 1,
    manager_confirmed: 2,
  };
  const ownSkillTiers = new Map<string, EvidenceTier>();
  for (const s of skillRows) {
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

  // Contract v2.1 mirrored facts — read from the SAME cached core row (the
  // core reader degrades the human-gated MP-2 columns to null when they are
  // unapplied → honest "not stated", never an invented outcome).
  const prefs = {
    pay_basis_preference: worker.pay_basis_preference,
    night_shifts_ok: worker.night_shifts_ok,
    weekend_shifts_ok: worker.weekend_shifts_ok,
    overtime_ok: worker.overtime_ok,
    driving_licence_categories: worker.driving_licence_categories,
    own_vehicle: worker.own_vehicle,
    own_tools: worker.own_tools,
  };
  const languageLevels: WorkerLanguageFact[] = (
    (langsRes?.data ?? []) as { lang: string | null; level: string | null }[]
  )
    .filter((l): l is { lang: string; level: string } => !!l.lang && !!l.level)
    .map((l) => ({ lang: l.lang, level: l.level }));

  return {
    workerId,
    skillRowCount: skillRows.length,
    worker: {
      availability_status: worker.availability_status ?? null,
      available_from: worker.available_from ?? null,
      current_location_country: country,
    },
    subject: {
      skills: [...ownSkillTiers.entries()].map(([uri, evidence]) => ({ uri, evidence })),
      professionSlug,
      country,
      city: preferredCity,
      preferredCountries,
      availabilityStatus: worker.availability_status ?? null,
      availableFrom: worker.available_from ?? null,
      // Contract v2 — engagement-form criterion (fires only when the demand
      // also states its engagement form via structured_v2).
      preferredContractType: worker.preferred_contract_type ?? null,
      // Contract v2.1 mirrored facts.
      languageLevels: languageLevels.length > 0 ? languageLevels : null,
      drivingLicenceCategories: prefs?.driving_licence_categories ?? null,
      ownVehicle: prefs?.own_vehicle ?? null,
      ownTools: prefs?.own_tools ?? null,
      payBasisPreference: prefs?.pay_basis_preference ?? null,
      nightShiftsOk: prefs?.night_shifts_ok ?? null,
      weekendShiftsOk: prefs?.weekend_shifts_ok ?? null,
      overtimeOk: prefs?.overtime_ok ?? null,
    },
  };
}
