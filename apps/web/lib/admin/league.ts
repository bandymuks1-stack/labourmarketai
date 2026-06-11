import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  computeThermometer,
  averageMidpoint,
  salaryMidpoint,
  type ThermometerResult,
} from "@/lib/market/thermometer";
import { SMALL_SAMPLE_N, UNKNOWN_BUCKET } from "@/lib/admin/market-analysis";

/**
 * Šalies lyga (TASK 07.4) — admin-only read model. The league is the market
 * intelligence view per country × profession, built ONLY from real rows:
 *   - workers / available-now / confirmed-skill counts (raw counts);
 *   - the owner-locked thermometer per cell, shown ONLY when BOTH components
 *     really exist: an admin-entered market_rate_averages row AND a declared
 *     position average with sample n >= 2 (one person's range is not an
 *     average and would leak an individual figure). Everywhere else the cell
 *     is an honest insufficient_data — NEVER a fake rating (doctrine §7).
 *
 * No ranking of people: rows order by team size (a raw count), and the
 * thermometer is a market price signal, not a human score
 * (PRODUCT_CONSTITUTION §10 — no universal human value).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export const LEAGUE_MIN_POSITION_N = 2;

export interface LeagueCell {
  readonly professionSlug: string;
  readonly country: string;
  readonly workers: number;
  readonly availableNow: number;
  readonly confirmedSkillWorkers: number;
  /** Declared-midpoint average (monthly EUR), ONLY when n >= 2; else null. */
  readonly declaredAvgEur: number | null;
  readonly declaredSampleN: number;
  /** Owner-locked thermometer for this cell (score | insufficient_data). */
  readonly thermometer: ThermometerResult;
  readonly smallSample: boolean;
}

export interface LeagueData {
  /** Country code → cells (workers desc). Includes the honest UNKNOWN bucket. */
  readonly countries: ReadonlyMap<string, LeagueCell[]>;
  /** Whether any admin market average exists at all (empty league framing). */
  readonly hasMarketAverages: boolean;
}

type WorkerRow = {
  id: string | null;
  current_location_country: string | null;
  availability_status: string | null;
  salary_min_eur: number | null;
  salary_max_eur: number | null;
};

export async function getLeague(): Promise<LeagueData> {
  const supabase = await createClient();

  const [wpRes, confirmedRes, avgRes] = await Promise.all([
    asAny(supabase)
      .from("worker_professions")
      .select(
        "worker_id, professions(slug), workers(id, current_location_country, availability_status, salary_min_eur, salary_max_eur)",
      ),
    asAny(supabase).from("worker_skills").select("worker_id").eq("verified", true),
    asAny(supabase)
      .from("market_rate_averages")
      .select("country, avg_rate_eur, professions(slug)")
      .eq("is_active", true),
  ]);

  const confirmedWorkers = new Set(
    ((confirmedRes.data ?? []) as { worker_id: string | null }[])
      .map((r) => r.worker_id)
      .filter((v): v is string => !!v),
  );

  // Admin market averages per profession × country (component 2).
  const marketAvg = new Map<string, number>();
  for (const r of (avgRes.data ?? []) as {
    country: string;
    avg_rate_eur: unknown;
    professions: { slug: string | null } | null;
  }[]) {
    const slug = r.professions?.slug;
    const avg = Number(r.avg_rate_eur);
    if (slug && Number.isFinite(avg) && avg > 0) {
      marketAvg.set(`${slug}::${r.country.toUpperCase()}`, avg);
    }
  }

  // Cells from real worker × profession rows.
  const cells = new Map<
    string,
    {
      professionSlug: string;
      country: string;
      workers: Set<string>;
      available: Set<string>;
      midpoints: (number | null)[];
    }
  >();
  for (const r of (wpRes.data ?? []) as {
    worker_id: string | null;
    professions: { slug: string | null } | null;
    workers: WorkerRow | null;
  }[]) {
    const slug = r.professions?.slug;
    const w = r.workers;
    const workerId = w?.id ?? r.worker_id;
    if (!slug || !workerId) continue;
    const country =
      (w?.current_location_country ?? "").trim().toUpperCase() || UNKNOWN_BUCKET;
    const key = `${slug}::${country}`;
    const cell = cells.get(key) ?? {
      professionSlug: slug,
      country,
      workers: new Set<string>(),
      available: new Set<string>(),
      midpoints: [] as (number | null)[],
    };
    if (!cell.workers.has(workerId)) {
      cell.workers.add(workerId);
      if (w?.availability_status === "available") cell.available.add(workerId);
      cell.midpoints.push(
        salaryMidpoint(w?.salary_min_eur ?? null, w?.salary_max_eur ?? null),
      );
    }
    cells.set(key, cell);
  }

  const countries = new Map<string, LeagueCell[]>();
  for (const c of cells.values()) {
    const realMidpoints = c.midpoints.filter((m): m is number => m !== null);
    const declaredSampleN = realMidpoints.length;
    const declaredAvgEur =
      declaredSampleN >= LEAGUE_MIN_POSITION_N
        ? averageMidpoint(realMidpoints)
        : null;
    const cell: LeagueCell = {
      professionSlug: c.professionSlug,
      country: c.country,
      workers: c.workers.size,
      availableNow: c.available.size,
      confirmedSkillWorkers: [...c.workers].filter((w) =>
        confirmedWorkers.has(w),
      ).length,
      declaredAvgEur,
      declaredSampleN,
      thermometer: computeThermometer({
        positionAvgEur: declaredAvgEur,
        marketAvgEur: marketAvg.get(`${c.professionSlug}::${c.country}`) ?? null,
      }),
      smallSample: c.workers.size < SMALL_SAMPLE_N,
    };
    const list = countries.get(c.country) ?? [];
    list.push(cell);
    countries.set(c.country, list);
  }
  for (const list of countries.values()) {
    list.sort(
      (a, b) =>
        b.workers - a.workers || a.professionSlug.localeCompare(b.professionSlug),
    );
  }

  return { countries, hasMarketAverages: marketAvg.size > 0 };
}
