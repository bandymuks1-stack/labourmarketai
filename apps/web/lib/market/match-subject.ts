import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sourceToEvidence, type EvidenceTier, type MatchSubject } from "@/lib/market/match-v1";

/**
 * Read layer for matching v1 — assembles a `MatchSubject` for each
 * employer-discoverable worker from REAL rows, so match-v1 runs on live data
 * (Full Cycle Sprint v1, Slice 3). Pure mapping (`sourceToEvidence`) is unit-
 * tested; the I/O assembler takes the caller's RLS-scoped client.
 *
 * Visibility: reads ONLY employer-visible tables — `workers`,
 * `worker_skills` (both `... or is_employer()`), `skills.esco_uri`
 * (`using(true)`), and approved `candidate_skills` ESCO mappings. It never
 * reads private worker content (journal text, raw candidate_skills text,
 * documents). Evidence tier comes from the real `worker_skills.source` column.
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
  /** The §19/match-v1 subject assembled from real rows. */
  readonly subject: MatchSubject;
}

/**
 * Assemble match subjects for the employer-discoverable worker supply. Returns
 * [] on any read error (never fabricates a worker). RLS on the passed client
 * is the authority — a company session sees the discoverable avatars.
 */
export async function buildSupplyCandidates(
  supabase: SupabaseClient,
): Promise<SupplyCandidate[]> {
  const { data: workers, error } = await asAny(supabase)
    .from("workers")
    .select(
      "id, profile_id, display_name, headline, availability_status, available_from, current_location_country, preferred_countries, salary_min_eur",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !Array.isArray(workers) || workers.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = workers as any[];
  const workerIds = rows.map((w) => w.id as string);
  const profileIds = rows
    .map((w) => w.profile_id as string | null)
    .filter((p): p is string => !!p);

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

  const [skillsRes, profsRes] = await Promise.all([
    asAny(supabase)
      .from("worker_skills")
      .select("worker_id, source, verified, skills ( slug, esco_uri )")
      .in("worker_id", workerIds),
    asAny(supabase)
      .from("worker_professions")
      .select("worker_id, is_primary, professions ( slug )")
      .in("worker_id", workerIds),
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

  // Approved candidate-skill ESCO mappings join as self_declared (the mapping
  // is curated, the skill stays self-declared until real work confirms it).
  if (profileIds.length > 0) {
    try {
      const { data: cand } = await asAny(supabase)
        .from("candidate_skills")
        .select("profile_id, mapped_esco_uri")
        .eq("status", "approved")
        .not("mapped_esco_uri", "is", null)
        .in("profile_id", profileIds);
      const workerByProfile = new Map<string, string>();
      for (const w of rows) {
        if (w.profile_id) workerByProfile.set(w.profile_id as string, w.id as string);
      }
      for (const c of (cand ?? []) as {
        profile_id: string;
        mapped_esco_uri: string | null;
      }[]) {
        const wid = workerByProfile.get(c.profile_id);
        if (!wid || !c.mapped_esco_uri) continue;
        const m = skillsByWorker.get(wid) ?? new Map<string, EvidenceTier>();
        if (!m.has(c.mapped_esco_uri)) m.set(c.mapped_esco_uri, "self_declared");
        skillsByWorker.set(wid, m);
      }
    } catch {
      // candidate_skills absent → curated worker_skills only (honest subset)
    }
  }

  return rows.map((w) => {
    const skillMap = skillsByWorker.get(w.id as string) ?? new Map();
    return {
      workerId: w.id as string,
      profileId: (w.profile_id as string | null) ?? null,
      displayName: (w.display_name as string | null) ?? null,
      headline: (w.headline as string | null) ?? null,
      professionSlug: professionByWorker.get(w.id as string) ?? null,
      subject: {
        skills: [...skillMap.entries()].map(([uri, evidence]) => ({ uri, evidence })),
        professionSlug: professionByWorker.get(w.id as string) ?? null,
        country: (w.current_location_country as string | null) ?? null,
        preferredCountries: (w.preferred_countries as string[] | null) ?? [],
        availabilityStatus: (w.availability_status as string | null) ?? null,
        availableFrom: (w.available_from as string | null) ?? null,
        salaryMinEur: (w.salary_min_eur as number | null) ?? null,
      } satisfies MatchSubject,
    };
  });
}
