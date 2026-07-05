import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Launch signals for the owner control room (PR12) — REAL aggregate counts
 * only, read with the caller's admin-RLS client. Any unavailable read
 * (table absent, RLS mismatch, transient error) yields null and renders as
 * "—" (unknown) — NEVER a fabricated number (§18: no fake analytics).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface LaunchSignals {
  readonly workers: number | null;
  readonly companies: number | null;
  readonly verifiedCompanies: number | null;
  readonly openDemands: number | null;
  readonly interestActive: number | null;
  readonly interestReviewed: number | null;
  readonly interestContacted: number | null;
}

async function count(
  supabase: SupabaseClient,
  table: string,
  filter?: (q: unknown) => unknown,
): Promise<number | null> {
  try {
    let q = asAny(supabase).from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) return null;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

export async function getLaunchSignals(supabase: SupabaseClient): Promise<LaunchSignals> {
  const [
    workers,
    companies,
    verifiedCompanies,
    openDemands,
    interestActive,
    interestReviewed,
    interestContacted,
  ] = await Promise.all([
    count(supabase, "workers"),
    count(supabase, "companies"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "companies", (q) => (q as any).eq("verification_status", "verified")),
    // Open = worker-visible pipeline state (the RPC additionally requires a
    // VERIFIED company; this count is the submitted pool).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "customer_requests", (q) => (q as any).eq("status", "submitted")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "demand_interest_signals", (q) => (q as any).eq("status", "interested")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "demand_interest_signals", (q) => (q as any).eq("status", "reviewed")),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "demand_interest_signals", (q) => (q as any).eq("status", "contacted")),
  ]);
  return {
    workers,
    companies,
    verifiedCompanies,
    openDemands,
    interestActive,
    interestReviewed,
    interestContacted,
  };
}
