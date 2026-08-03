import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourceToEvidence,
  type EvidenceTier,
  type MatchNeed,
  type MatchSubject,
  type WorkerLanguageFact,
} from "@/lib/market/match-v1";
import {
  explicitIdsReport,
  planSupplyRetrieval,
  selectPoolIds,
  STAGE1_ID_SCAN_CAP,
  SUPPLY_POOL_BUDGET,
  type SupplyRetrievalPlan,
  type SupplyRetrievalReport,
  type TierResult,
} from "@/lib/market/supply-retrieval";
import {
  lastActiveBucket,
  type LastActiveBucket,
} from "@/lib/scouting/profile-freshness";

/**
 * Read layer for matching v1 — assembles a `MatchSubject` for each
 * employer-discoverable worker from REAL rows, so match-v1 runs on live data
 * (Full Cycle Sprint v1, Slice 3). Pure mapping (`sourceToEvidence`) is unit-
 * tested; the I/O assembler takes the caller's RLS-scoped client.
 *
 * Visibility: reads ONLY employer-visible tables — `workers`,
 * `worker_skills` (both `... or is_employer()`), `skills.esco_uri`
 * (`using(true)`). It never reads private worker content (journal text,
 * documents). Evidence tier comes from the real `worker_skills.source`
 * column. (The candidate_skills join was removed in W5 slice 1 — the table
 * never had a writer.)
 *
 * W10 slice 3 (audit P0-3) — STAGED RETRIEVAL. The pool used to be
 * `order(created_at desc).limit(200)`: the 200 newest registrations,
 * demand-blind. Now Stage 1 retrieves candidate IDS from index-backed,
 * demand-driven predicates (see lib/market/supply-retrieval.ts), Stage 2
 * fetches full rows for those ids by primary key, and Stage 3 — the ranking —
 * is untouched. Retrieval never orders by registration date again, and when
 * the pool budget binds the caller is told (`SupplyRetrievalReport.capped`).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface SupplyCandidate {
  readonly workerId: string;
  readonly profileId: string | null;
  readonly displayName: string | null;
  readonly headline: string | null;
  readonly professionSlug: string | null;
  /** Profile freshness from the best REAL timestamp (workers.updated_at,
   *  falling back to created_at). Wagon 1: shown honestly on discovery and
   *  used to DEMOTE (never hide) dormant profiles. */
  readonly lastActiveBucket: LastActiveBucket;
  /** The §19/match-v1 subject assembled from real rows. */
  readonly subject: MatchSubject;
}

/** What one assembled pool carries: the candidates AND how they were found. */
export interface SupplyPool {
  readonly candidates: SupplyCandidate[];
  readonly retrieval: SupplyRetrievalReport;
}

/** How the caller wants the pool retrieved. There is no default: every caller
 *  states its retrieval basis, so "which workers did we even look at?" always
 *  has an answer. */
export type SupplyRetrievalInput =
  /** Plan Stage 1 from this demand (company scouting). */
  | { readonly need: MatchNeed; readonly budget?: number }
  /** The caller already knows which workers it wants (admin workbench). */
  | { readonly workerIds: readonly string[]; readonly budget?: number };

/** Read one Stage-1 id column. Never throws: a tier that fails (table absent,
 *  RLS, transport) contributes no ids, which costs PRIORITY, not reachability
 *  — the backfill still carries those workers into the pool. */
async function readIdTier(
  tier: TierResult["tier"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  column: string,
): Promise<TierResult> {
  try {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return { tier, ids: [] };
    const ids = (data as Record<string, unknown>[])
      .map((r) => r[column])
      .filter((v): v is string => typeof v === "string" && v !== "");
    return { tier, ids, truncated: data.length >= STAGE1_ID_SCAN_CAP };
  } catch {
    return { tier, ids: [] };
  }
}

/**
 * Stage 1 — resolve the demand plan to candidate ids using ONLY indexed,
 * single-column reads:
 *   skill      skills.slug/esco_uri (unique) → worker_skills.skill_id
 *              (idx_worker_skills_skill_id)
 *   profession professions.slug (unique) → worker_professions.profession_id
 *              (idx_worker_professions_profession_id)
 *   location   workers.current_location_country / preferred_countries
 *   backfill   workers.id ascending — deterministic, and only read when the
 *              demand tiers left budget unspent.
 */
async function retrievePoolIds(
  supabase: SupabaseClient,
  plan: SupplyRetrievalPlan,
): Promise<TierResult[]> {
  const tiers: TierResult[] = [];

  // ── skill tier ────────────────────────────────────────────────────────
  if (plan.skillSlugs.length > 0 || plan.escoUris.length > 0) {
    const skillIds = new Set<string>();
    const skillLookups: Promise<unknown>[] = [];
    if (plan.skillSlugs.length > 0) {
      skillLookups.push(
        asAny(supabase).from("skills").select("id").in("slug", plan.skillSlugs),
      );
    }
    if (plan.escoUris.length > 0) {
      skillLookups.push(
        asAny(supabase).from("skills").select("id").in("esco_uri", plan.escoUris),
      );
    }
    for (const res of await Promise.all(
      skillLookups.map((p) =>
        Promise.resolve(p).then(
          (r) => r as { data: unknown },
          () => ({ data: null }),
        ),
      ),
    )) {
      for (const row of (res.data ?? []) as { id?: unknown }[]) {
        if (typeof row.id === "string") skillIds.add(row.id);
      }
    }
    if (skillIds.size > 0) {
      tiers.push(
        await readIdTier(
          "skill",
          asAny(supabase)
            .from("worker_skills")
            .select("worker_id")
            .in("skill_id", [...skillIds].sort())
            .order("worker_id", { ascending: true })
            .limit(STAGE1_ID_SCAN_CAP),
          "worker_id",
        ),
      );
    }
  }

  // ── profession tier ───────────────────────────────────────────────────
  if (plan.professionSlug) {
    let professionIds: string[] = [];
    try {
      const { data } = await asAny(supabase)
        .from("professions")
        .select("id")
        .eq("slug", plan.professionSlug);
      professionIds = ((data ?? []) as { id?: unknown }[])
        .map((r) => r.id)
        .filter((v): v is string => typeof v === "string");
    } catch {
      professionIds = [];
    }
    if (professionIds.length > 0) {
      tiers.push(
        await readIdTier(
          "profession",
          asAny(supabase)
            .from("worker_professions")
            .select("worker_id")
            .in("profession_id", professionIds.sort())
            .order("worker_id", { ascending: true })
            .limit(STAGE1_ID_SCAN_CAP),
          "worker_id",
        ),
      );
    }
  }

  // ── location tier ─────────────────────────────────────────────────────
  // Two narrow reads instead of one `or(...)` string: the country code never
  // has to be concatenated into a PostgREST filter expression. `ilike` with no
  // wildcard is an exact case-insensitive compare, matching the engine's own
  // trim+lowercase comparison (match-v1.ts:322).
  if (plan.countryCode) {
    const cc = plan.countryCode;
    const [here, mobile] = await Promise.all([
      readIdTier(
        "location",
        asAny(supabase)
          .from("workers")
          .select("id")
          .ilike("current_location_country", cc)
          .order("id", { ascending: true })
          .limit(STAGE1_ID_SCAN_CAP),
        "id",
      ),
      readIdTier(
        "location",
        asAny(supabase)
          .from("workers")
          .select("id")
          .overlaps("preferred_countries", [cc, cc.toLowerCase()])
          .order("id", { ascending: true })
          .limit(STAGE1_ID_SCAN_CAP),
        "id",
      ),
    ]);
    // One `location` tier, so being both resident AND mobile scores once.
    tiers.push({
      tier: "location",
      ids: [...here.ids, ...mobile.ids],
      truncated: here.truncated || mobile.truncated,
    });
  }

  // ── backfill ──────────────────────────────────────────────────────────
  // Only when the demand tiers left room. Ordered by id — deterministic, and
  // pointedly NOT by created_at: no worker is ever pushed out of the pool by a
  // newer registration again.
  const matched = new Set(tiers.flatMap((t) => t.ids));
  if (matched.size < plan.budget) {
    tiers.push(
      await readIdTier(
        "backfill",
        asAny(supabase)
          .from("workers")
          .select("id")
          .order("id", { ascending: true })
          .limit(Math.min(plan.budget + 1, STAGE1_ID_SCAN_CAP)),
        "id",
      ),
    );
  }

  return tiers;
}

/**
 * Assemble match subjects for the employer-discoverable worker supply.
 * Returns an empty pool on any read error (never fabricates a worker). RLS on
 * the passed client is the authority — a company session sees the
 * discoverable avatars.
 *
 * Stage 1 chooses WHICH workers (demand-driven, deterministic); this function
 * is Stage 2 — full rows for exactly those ids, by primary key.
 */
export async function buildSupplyCandidates(
  supabase: SupabaseClient,
  input: SupplyRetrievalInput,
): Promise<SupplyPool> {
  const budget = input.budget ?? SUPPLY_POOL_BUDGET;

  let poolIds: readonly string[];
  let retrieval: SupplyRetrievalReport;
  if ("workerIds" in input) {
    const unique = [...new Set(input.workerIds.filter((id) => typeof id === "string" && id !== ""))];
    poolIds = unique.slice(0, budget);
    retrieval = explicitIdsReport(unique, poolIds, budget);
  } else {
    const plan = planSupplyRetrieval(input.need, budget);
    const selection = selectPoolIds(await retrievePoolIds(supabase, plan), plan.budget);
    poolIds = selection.ids;
    retrieval = selection.report;
  }
  if (poolIds.length === 0) return { candidates: [], retrieval: { ...retrieval, poolSize: 0 } };

  // Stage 2 — full rows for the retrieved ids only (primary-key lookup).
  const { data: workers, error } = await asAny(supabase)
    .from("workers")
    .select(
      "id, profile_id, display_name, headline, availability_status, available_from, current_location_country, preferred_countries, salary_min_eur, preferred_contract_type, experience_years, created_at, updated_at",
    )
    .in("id", poolIds);
  if (error || !Array.isArray(workers) || workers.length === 0) {
    return { candidates: [], retrieval: { ...retrieval, poolSize: 0 } };
  }

  // Pin the assembled order to the Stage-1 pool order. The ranking sorts this
  // list anyway, but an unpinned input order made the pre-sort sequence depend
  // on PostgREST row order (audit P2-6) — two loads of the same page could
  // present equal candidates differently.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const w of workers as any[]) byId.set(w.id as string, w);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = poolIds.map((id) => byId.get(id)).filter(Boolean);
  const workerIds = rows.map((w) => w.id as string);

  // worker_skills.source → evidence tier, keyed on the CANONICAL SKILL SLUG
  // (best tier wins). PR4 repair: this used to key on skills.esco_uri and
  // silently DROPPED every skill whose esco_uri was NULL — which in prod was
  // ALL of them (0/152 curated), making the whole supply side skill-less.
  // The slug exists for 100% of rows; esco_uri rides along only as a legacy
  // alias for human-ESCO-structured needs.
  const tierRank: Record<EvidenceTier, number> = {
    self_declared: 0,
    work_journal: 1,
    manager_confirmed: 2,
  };
  const skillsByWorker = new Map<string, Map<string, EvidenceTier>>();
  const professionByWorker = new Map<string, string>();

  // Contract v2.1 mirrored facts — FEATURE-DETECTED second reads. The MP-2
  // workers columns (PR #721) and the worker_languages table (PR #720) are
  // HUMAN-GATED and may not be applied: a 42703 / 42P01 response leaves the
  // facts undefined (→ honest missingFacts in the engine), never an error,
  // and the primary workers query above stays untouched so nothing regresses.
  const [skillsRes, profsRes, prefsRes, langsRes] = await Promise.all([
    asAny(supabase)
      .from("worker_skills")
      .select("worker_id, source, verified, skills ( slug, esco_uri )")
      .in("worker_id", workerIds),
    asAny(supabase)
      .from("worker_professions")
      .select("worker_id, is_primary, professions ( slug )")
      .in("worker_id", workerIds),
    asAny(supabase)
      .from("workers")
      .select(
        "id, pay_basis_preference, night_shifts_ok, weekend_shifts_ok, overtime_ok, driving_licence_categories, own_vehicle, own_tools",
      )
      .in("id", workerIds)
      .then(
        (r: { data: unknown; error: unknown }) => (r.error ? { data: null } : r),
        () => ({ data: null }),
      ),
    asAny(supabase)
      .from("worker_languages")
      .select("worker_id, lang, level")
      .in("worker_id", workerIds)
      .then(
        (r: { data: unknown; error: unknown }) => (r.error ? { data: null } : r),
        () => ({ data: null }),
      ),
  ]);

  for (const s of (skillsRes.data ?? []) as {
    worker_id: string;
    source: string | null;
    verified: boolean | null;
    skills: { slug: string | null; esco_uri: string | null } | null;
  }[]) {
    const id = s.skills?.slug ?? s.skills?.esco_uri;
    if (!id) continue;
    // verified=true is the manager-confirmed truth even if source lags.
    const tier: EvidenceTier = s.verified ? "manager_confirmed" : sourceToEvidence(s.source);
    const m = skillsByWorker.get(s.worker_id) ?? new Map<string, EvidenceTier>();
    const prev = m.get(id);
    if (!prev || tierRank[tier] > tierRank[prev]) m.set(id, tier);
    skillsByWorker.set(s.worker_id, m);
  }

  for (const p of (profsRes.data ?? []) as {
    worker_id: string;
    is_primary: boolean | null;
    professions: { slug: string | null } | null;
  }[]) {
    const slug = p.professions?.slug;
    if (!slug) continue;
    if (p.is_primary || !professionByWorker.has(p.worker_id)) {
      professionByWorker.set(p.worker_id, slug);
    }
  }

  // MP-2 preference columns keyed by worker (absent pre-apply → empty map).
  interface WorkerPrefsRow {
    id: string;
    pay_basis_preference: string | null;
    night_shifts_ok: boolean | null;
    weekend_shifts_ok: boolean | null;
    overtime_ok: boolean | null;
    driving_licence_categories: string[] | null;
    own_vehicle: boolean | null;
    own_tools: boolean | null;
  }
  const prefsByWorker = new Map<string, WorkerPrefsRow>();
  for (const p of ((prefsRes.data ?? []) as WorkerPrefsRow[])) {
    prefsByWorker.set(p.id, p);
  }

  // MP-1 worker_languages keyed by worker (absent pre-apply → empty map).
  const languagesByWorker = new Map<string, WorkerLanguageFact[]>();
  for (const l of ((langsRes.data ?? []) as {
    worker_id: string;
    lang: string | null;
    level: string | null;
  }[])) {
    if (!l.lang || !l.level) continue;
    const list = languagesByWorker.get(l.worker_id) ?? [];
    list.push({ lang: l.lang, level: l.level });
    languagesByWorker.set(l.worker_id, list);
  }

  // W5 slice 1: the candidate_skills join was REMOVED. The table never had a
  // writer (the capture slice shipped to skill_candidate_clarifications and
  // profile_skill_claims instead), so this read only ever saw an empty set.
  // Supply stays curated worker_skills — the honest truth, now stated plainly.

  const candidates: SupplyCandidate[] = rows.map((w) => {
    const skillMap = skillsByWorker.get(w.id as string) ?? new Map();
    return {
      workerId: w.id as string,
      profileId: (w.profile_id as string | null) ?? null,
      displayName: (w.display_name as string | null) ?? null,
      headline: (w.headline as string | null) ?? null,
      professionSlug: professionByWorker.get(w.id as string) ?? null,
      lastActiveBucket: lastActiveBucket(
        (w.updated_at as string | null) ?? (w.created_at as string | null),
      ),
      subject: {
        skills: [...skillMap.entries()].map(([uri, evidence]) => ({ uri, evidence })),
        professionSlug: professionByWorker.get(w.id as string) ?? null,
        country: (w.current_location_country as string | null) ?? null,
        preferredCountries: (w.preferred_countries as string[] | null) ?? [],
        availabilityStatus: (w.availability_status as string | null) ?? null,
        availableFrom: (w.available_from as string | null) ?? null,
        salaryMinEur: (w.salary_min_eur as number | null) ?? null,
        // Contract v2: engagement-form hard check fires only when BOTH sides
        // stated their form (workers.preferred_contract_type is applied prod
        // schema — see gap map Capability B).
        preferredContractType: (w.preferred_contract_type as string | null) ?? null,
        // Wagon 4: evaluated only when the demand author set a
        // requirement_priorities.min_experience tier.
        experienceYears: (w.experience_years as number | null) ?? null,
        // Contract v2.1 mirrored facts (human-gated MP-1/MP-2 stores;
        // pre-apply they read back undefined/null = honest "not stated").
        languageLevels: languagesByWorker.get(w.id as string) ?? null,
        drivingLicenceCategories:
          prefsByWorker.get(w.id as string)?.driving_licence_categories ?? null,
        ownVehicle: prefsByWorker.get(w.id as string)?.own_vehicle ?? null,
        ownTools: prefsByWorker.get(w.id as string)?.own_tools ?? null,
        payBasisPreference:
          prefsByWorker.get(w.id as string)?.pay_basis_preference ?? null,
        nightShiftsOk: prefsByWorker.get(w.id as string)?.night_shifts_ok ?? null,
        weekendShiftsOk: prefsByWorker.get(w.id as string)?.weekend_shifts_ok ?? null,
        overtimeOk: prefsByWorker.get(w.id as string)?.overtime_ok ?? null,
      } satisfies MatchSubject,
    };
  });

  return { candidates, retrieval: { ...retrieval, poolSize: candidates.length } };
}
