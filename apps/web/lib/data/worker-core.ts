import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { CoreRead, DomainCaller } from "@/lib/domain/caller";

/**
 * Request-cached CORE worker readers (P0 nav-performance repair, Track B).
 *
 * Production evidence (2026-07-19, single dashboard navigation): the same
 * signed-in worker's rows were re-read by every lib helper independently —
 * `workers` 4× with different column subsets, `worker_professions` 4×
 * (always `is_primary = true`), `worker_skills` 5×, `preferred_locations`
 * 2-3×. Each reader below is THE canonical per-request read of one of those
 * tables (guard-pinned by lib/guards/p0-auth-dashboard-performance.test.ts):
 * React `cache()` collapses all consumers within one request into a single
 * round-trip, and `createClient()` is itself request-cached with a memoised
 * `auth.getUser()`, so no extra auth round-trips are added.
 *
 * Contract:
 *   - Every reader resolves the CURRENT user internally (session → RLS own
 *     rows only). No caller-supplied ids — a caller can never read another
 *     user's rows through this module.
 *   - Request-scoped deduplication ONLY, never time-based caching: a new
 *     navigation always re-reads.
 *   - Defensive: null / [] on any error (honest degradation, never a throw
 *     and never fabricated data).
 *   - The `workers` select is the SUPERSET of the columns the per-navigation
 *     consumers used across their 4 independent selects, so adopting the
 *     shared read never loses a column any consumer relied on.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Superset of the columns the per-navigation `workers` consumers selected
 *  (player-card, worker-subject primary + mirrored-facts reads, hub
 *  availability). Every column exists in the generated Database types. */
const WORKER_FULL_COLS =
  "id, profile_id, availability_status, available_from, current_location_country, preferred_countries, preferred_contract_type, willing_to_relocate, has_transport, driving_licence_categories, pay_basis_preference, night_shifts_ok, weekend_shifts_ok, overtime_ok, own_vehicle, own_tools, work_card_confirmed_at";

/** Fallback column set for environments where the human-gated MP-2 /
 *  work-card columns are not applied yet (Postgres 42703). Mirrors the old
 *  feature-detected behaviour: the base row still loads, the newer facts
 *  degrade honestly to null. */
const WORKER_BASE_COLS =
  "id, profile_id, availability_status, available_from, current_location_country, preferred_countries, preferred_contract_type";

const UNDEFINED_COLUMN_CODE = "42703";

export interface WorkerCoreRow {
  id: string;
  profile_id: string | null;
  availability_status: string | null;
  available_from: string | null;
  current_location_country: string | null;
  preferred_countries: string[] | null;
  preferred_contract_type: string | null;
  willing_to_relocate: boolean | null;
  has_transport: boolean | null;
  driving_licence_categories: string[] | null;
  pay_basis_preference: string | null;
  night_shifts_ok: boolean | null;
  weekend_shifts_ok: boolean | null;
  overtime_ok: boolean | null;
  own_vehicle: boolean | null;
  own_tools: boolean | null;
  work_card_confirmed_at: string | null;
}

/**
 * THE canonical `workers` row read as an explicit caller (G4 bridge) — the
 * transport-neutral core under `getWorkerCoreRow`. Same query, same
 * feature-detected column fallback; the difference is the honest three-state
 * result: `{ ok: false }` on a failed read, `{ ok: true, value: null }` when
 * the caller has no worker row (#1314 — absence and failure are different
 * facts, and bearer consumers must be able to tell them apart).
 */
export async function readWorkerCoreRow(
  caller: DomainCaller,
): Promise<CoreRead<WorkerCoreRow | null>> {
  try {
    const full = await asAny(caller.supabase)
      .from("workers")
      .select(WORKER_FULL_COLS)
      .eq("profile_id", caller.userId)
      .maybeSingle();
    if (!full.error) {
      return { ok: true, value: (full.data as WorkerCoreRow | null) ?? null };
    }

    // Missing human-gated column → degrade to the base set (never throw).
    if (full.error.code !== UNDEFINED_COLUMN_CODE) return { ok: false };
    const base = await asAny(caller.supabase)
      .from("workers")
      .select(WORKER_BASE_COLS)
      .eq("profile_id", caller.userId)
      .maybeSingle();
    if (base.error) return { ok: false };
    if (!base.data) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        willing_to_relocate: null,
        has_transport: null,
        driving_licence_categories: null,
        pay_basis_preference: null,
        night_shifts_ok: null,
        weekend_shifts_ok: null,
        overtime_ok: null,
        own_vehicle: null,
        own_tools: null,
        work_card_confirmed_at: null,
        ...(base.data as Partial<WorkerCoreRow>),
      } as WorkerCoreRow,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * THE canonical per-request `workers` row read (workers.profile_id =
 * auth.uid()). One round-trip per navigation regardless of how many
 * consumers call it. Null when signed out, when no worker row exists, or on
 * any read error. Delegates to the caller-scoped core above — one query
 * contract for every transport.
 */
export const getWorkerCoreRow = cache(
  async (): Promise<WorkerCoreRow | null> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const read = await readWorkerCoreRow({ supabase, userId: user.id });
      return read.ok ? read.value : null;
    } catch {
      return null;
    }
  },
);

export interface WorkerProfessionRow {
  is_primary: boolean | null;
  profession_id: string | null;
  professions: { slug: string | null } | null;
}

/**
 * THE canonical `worker_professions` read as an explicit caller (G4 bridge) —
 * the transport-neutral core under `getWorkerProfessionRows`. `workerId` must
 * be the caller's OWN worker row (RLS scopes the rows regardless).
 */
export async function readWorkerProfessionRows(
  caller: DomainCaller,
  workerId: string,
): Promise<CoreRead<WorkerProfessionRow[]>> {
  try {
    const { data, error } = await asAny(caller.supabase)
      .from("worker_professions")
      .select("is_primary, profession_id, professions(slug)")
      .eq("worker_id", workerId)
      .order("is_primary", { ascending: false });
    if (error || !Array.isArray(data)) return { ok: false };
    return { ok: true, value: data as WorkerProfessionRow[] };
  } catch {
    return { ok: false };
  }
}

/**
 * THE canonical per-request `worker_professions` read for the signed-in
 * worker (primary first). Consumers derive "the primary profession" from
 * this ONE result instead of each issuing their own `is_primary = true`
 * select (4× per navigation in production). [] when there is no worker row
 * or on any error. Delegates to the caller-scoped core above.
 */
export const getWorkerProfessionRows = cache(
  async (): Promise<WorkerProfessionRow[]> => {
    try {
      const worker = await getWorkerCoreRow();
      if (!worker) return [];
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const read = await readWorkerProfessionRows(
        { supabase, userId: user.id },
        worker.id,
      );
      return read.ok ? read.value : [];
    } catch {
      return [];
    }
  },
);

export interface WorkerSkillRow {
  id: string;
  skill_id: string | null;
  verified: boolean | null;
  source: string | null;
  /** When the skill was confirmed — carried for the Living CV consumers
   *  (superset pattern: one select serves every transport). */
  verified_at: string | null;
  confidence_bin: string | null;
  /** Catalogue slug — the ONLY name source. The `skills` table carries just
   *  id/slug/category/is_active/esco_uri; the legacy name_lt/name_en columns
   *  do NOT exist (selecting them 400-ed on every navigation). */
  skills: { slug: string | null } | null;
}

/**
 * THE canonical `worker_skills` read as an explicit caller (G4 bridge) — the
 * transport-neutral core under `getWorkerSkillRows` AND the MCP
 * `living_cv.skills.get` capability. `workerId` must be the caller's OWN
 * worker row (RLS scopes the rows regardless); honest three-state result.
 */
export async function readWorkerSkillRows(
  caller: DomainCaller,
  workerId: string,
): Promise<CoreRead<WorkerSkillRow[]>> {
  try {
    const { data, error } = await asAny(caller.supabase)
      .from("worker_skills")
      .select(
        "id, skill_id, verified, source, verified_at, confidence_bin, skills(slug)",
      )
      .eq("worker_id", workerId);
    if (error || !Array.isArray(data)) return { ok: false };
    return { ok: true, value: data as WorkerSkillRow[] };
  } catch {
    return { ok: false };
  }
}

/**
 * THE canonical per-request `worker_skills` read for the signed-in worker
 * (was 5 independent selects per navigation). [] when there is no worker
 * row or on any error. Delegates to the caller-scoped core above.
 */
export const getWorkerSkillRows = cache(async (): Promise<WorkerSkillRow[]> => {
  try {
    const worker = await getWorkerCoreRow();
    if (!worker) return [];
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const read = await readWorkerSkillRows({ supabase, userId: user.id }, worker.id);
    return read.ok ? read.value : [];
  } catch {
    return [];
  }
});

export interface PreferredLocationCoreRow {
  city: string | null;
  country_code: string | null;
  priority: string | null;
  active: boolean | null;
}

/**
 * THE canonical per-request read of the caller's ACTIVE preferred locations
 * (own rows, §20 — never readable by employers), priority order. The table
 * is owner-gated and may be absent in some environments → []. NOTE: the
 * market-map management surface (lib/market-map/capture.ts) keeps its own
 * richer select (all rows incl. inactive + visibility/intents columns) — a
 * different read model, not a duplicate of this one.
 */
export const getPreferredLocationRows = cache(
  async (): Promise<PreferredLocationCoreRow[]> => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await asAny(supabase)
        .from("preferred_locations")
        .select("city, country_code, priority, active")
        .eq("profile_id", user.id)
        .eq("active", true)
        .order("priority", { ascending: true });
      if (error || !Array.isArray(data)) return [];
      return data as PreferredLocationCoreRow[];
    } catch {
      return [];
    }
  },
);

/** The signed-in worker's primary profession slug (or null) — derived from
 *  the ONE cached profession read; replaces the per-consumer
 *  `is_primary = true` selects. */
export const getPrimaryProfessionSlug = cache(
  async (): Promise<string | null> => {
    const rows = await getWorkerProfessionRows();
    return rows.find((r) => r.is_primary === true)?.professions?.slug ?? null;
  },
);

/** Unique catalogue slugs of ALL the worker's declared skills — derived from
 *  the ONE cached skill read. */
export const getDeclaredSkillSlugs = cache(async (): Promise<string[]> => {
  const rows = await getWorkerSkillRows();
  const slugs = new Set<string>();
  for (const r of rows) {
    const slug = r.skills?.slug;
    if (typeof slug === "string" && slug) slugs.add(slug);
  }
  return [...slugs];
});
