import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Market analysis v1 (S4 item 4) — admin-only read model. ONLY real counts of
 * real rows under admin RLS; nothing weighted, nothing estimated:
 *  - supply: workers per profession × current_location_country (a missing
 *    country is reported as its own honest "unknown" bucket, never guessed),
 *    plus the factual confirmed-skill sub-count (trust→visibility signal);
 *  - demand: customer_requests per country × role text. The intake stores a
 *    FREE-TEXT role (role_or_work_type) with no profession FK — the
 *    supply/demand profession join does NOT exist today and the view says so
 *    instead of pretending (gap analysis is country-level only);
 *  - averages: admin-entered market_rate_averages — degrades to
 *    needs-migration while the S4 draft is not applied.
 * Small samples (n < SMALL_SAMPLE_N) carry a warning flag for the UI.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export const SMALL_SAMPLE_N = 5;
export const UNKNOWN_BUCKET = "unknown";

const MISSING_TABLE_CODE = "42P01";

export interface SupplyCell {
  readonly professionSlug: string;
  readonly country: string; // ISO-2 or UNKNOWN_BUCKET
  readonly workers: number;
  /** Workers in the cell with ≥1 manager-confirmed skill (factual signal). */
  readonly confirmedSkillWorkers: number;
  readonly smallSample: boolean;
}

export interface DemandCell {
  readonly country: string; // as stored (free-form) or UNKNOWN_BUCKET
  readonly roleText: string; // free text — NOT a profession FK (said honestly)
  readonly requests: number;
  readonly smallSample: boolean;
}

export interface CountryGap {
  readonly country: string;
  readonly demandRequests: number;
  readonly supplyWorkers: number;
}

export interface MarketAverageRow {
  readonly id: string;
  readonly professionSlug: string;
  readonly country: string;
  readonly avgRateEur: number;
  readonly basis: string;
  readonly sourceStatus: string;
  readonly sourceNote: string | null;
  readonly enteredAt: string;
}

export interface MarketAnalysis {
  readonly supply: readonly SupplyCell[];
  readonly demand: readonly DemandCell[];
  readonly countryGaps: readonly CountryGap[];
  readonly averages:
    | { kind: "ok"; rows: readonly MarketAverageRow[] }
    | { kind: "needs-migration" };
  readonly professions: readonly { id: string; slug: string }[];
}

export async function getMarketAnalysis(): Promise<MarketAnalysis> {
  const supabase = await createClient();

  // ── Supply: worker × profession × country ────────────────────────────────
  const { data: wpRows } = await asAny(supabase)
    .from("worker_professions")
    .select("worker_id, professions(slug), workers(id, current_location_country)");
  // Confirmed-skill workers (factual signal, never a score).
  const { data: confirmedRows } = await asAny(supabase)
    .from("worker_skills")
    .select("worker_id")
    .eq("verified", true);
  const confirmedWorkers = new Set(
    ((confirmedRows ?? []) as { worker_id: string | null }[])
      .map((r) => r.worker_id)
      .filter((v): v is string => !!v),
  );

  const supplyMap = new Map<
    string,
    { professionSlug: string; country: string; workers: Set<string> }
  >();
  for (const r of (wpRows ?? []) as {
    worker_id: string | null;
    professions: { slug: string | null } | null;
    workers: { id: string | null; current_location_country: string | null } | null;
  }[]) {
    const slug = r.professions?.slug;
    const workerId = r.workers?.id ?? r.worker_id;
    if (!slug || !workerId) continue;
    const country = (r.workers?.current_location_country ?? "").trim().toUpperCase() || UNKNOWN_BUCKET;
    const key = `${slug}::${country}`;
    const cell = supplyMap.get(key) ?? {
      professionSlug: slug,
      country,
      workers: new Set<string>(),
    };
    cell.workers.add(workerId);
    supplyMap.set(key, cell);
  }
  const supply: SupplyCell[] = [...supplyMap.values()]
    .map((c) => ({
      professionSlug: c.professionSlug,
      country: c.country,
      workers: c.workers.size,
      confirmedSkillWorkers: [...c.workers].filter((w) => confirmedWorkers.has(w))
        .length,
      smallSample: c.workers.size < SMALL_SAMPLE_N,
    }))
    .sort(
      (a, b) =>
        b.workers - a.workers ||
        a.professionSlug.localeCompare(b.professionSlug) ||
        a.country.localeCompare(b.country),
    );

  // ── Demand: customer_requests × country × role text ──────────────────────
  const { data: crRows } = await asAny(supabase)
    .from("customer_requests")
    .select("country, role_or_work_type");
  const demandMap = new Map<string, { country: string; roleText: string; n: number }>();
  for (const r of (crRows ?? []) as {
    country: string | null;
    role_or_work_type: string | null;
  }[]) {
    const country = (r.country ?? "").trim().toUpperCase() || UNKNOWN_BUCKET;
    const roleText = (r.role_or_work_type ?? "").trim() || "—";
    const key = `${country}::${roleText.toLowerCase()}`;
    const cell = demandMap.get(key) ?? { country, roleText, n: 0 };
    cell.n += 1;
    demandMap.set(key, cell);
  }
  const demand: DemandCell[] = [...demandMap.values()]
    .map((c) => ({
      country: c.country,
      roleText: c.roleText,
      requests: c.n,
      smallSample: c.n < SMALL_SAMPLE_N,
    }))
    .sort((a, b) => b.requests - a.requests || a.country.localeCompare(b.country));

  // ── Country-level gaps (the only honest join — demand has no profession FK)
  const supplyByCountry = new Map<string, number>();
  for (const s of supply) {
    supplyByCountry.set(s.country, (supplyByCountry.get(s.country) ?? 0) + s.workers);
  }
  const demandByCountry = new Map<string, number>();
  for (const d of demand) {
    demandByCountry.set(d.country, (demandByCountry.get(d.country) ?? 0) + d.requests);
  }
  const countryGaps: CountryGap[] = [...demandByCountry.entries()]
    .map(([country, demandRequests]) => ({
      country,
      demandRequests,
      supplyWorkers: supplyByCountry.get(country) ?? 0,
    }))
    .sort((a, b) => a.supplyWorkers - b.supplyWorkers || b.demandRequests - a.demandRequests);

  // ── Admin averages — degrade honestly until the S4 draft is applied ──────
  let averages: MarketAnalysis["averages"] = { kind: "needs-migration" };
  const { data: avgRows, error: avgErr } = await asAny(supabase)
    .from("market_rate_averages")
    .select(
      "id, country, avg_rate_eur, basis, source_status, source_note, entered_at, professions(slug)",
    )
    .eq("is_active", true)
    .order("entered_at", { ascending: false });
  if (!avgErr) {
    averages = {
      kind: "ok",
      rows: ((avgRows ?? []) as {
        id: string;
        country: string;
        avg_rate_eur: unknown;
        basis: string;
        source_status: string;
        source_note: string | null;
        entered_at: string;
        professions: { slug: string | null } | null;
      }[]).map((r) => ({
        id: r.id,
        professionSlug: r.professions?.slug ?? "—",
        country: r.country,
        avgRateEur: Number(r.avg_rate_eur),
        basis: r.basis,
        sourceStatus: r.source_status,
        sourceNote: r.source_note,
        enteredAt: r.entered_at,
      })),
    };
  } else if (avgErr.code !== MISSING_TABLE_CODE) {
    averages = { kind: "ok", rows: [] };
  }

  // Profession catalogue for the entry form.
  const { data: profRows } = await asAny(supabase)
    .from("professions")
    .select("id, slug")
    .eq("is_active", true);
  const professions = ((profRows ?? []) as { id: string; slug: string }[]).sort(
    (a, b) => a.slug.localeCompare(b.slug),
  );

  return { supply, demand, countryGaps, averages, professions };
}
