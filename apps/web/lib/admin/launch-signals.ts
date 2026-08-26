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
  /**
   * How many of those raised hands actually reached the demand owner as a
   * durable notification.
   *
   * WHY THIS IS A SIGNAL AND NOT A DETAIL. The emitter cannot fail loudly by
   * design — it swallows every error so a failed notification can never fail a
   * worker's interest — which means a permanent delivery failure is invisible
   * from inside the product. Production on 2026-08-26 held five interest
   * signals and two `demand_interest_expressed` events, both of them carrying
   * `created_at` identical to their signal rows to the microsecond, which this
   * emitter cannot produce because it never sets `created_at`. Read beside the
   * interest counts, that gap is legible; alone, neither number says anything.
   */
  readonly interestNotified: number | null;
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
    interestNotified,
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
    // The delivery side of the same event. Null (unknown) if the store is not
    // readable here — never 0, which would read as "delivered nothing" when it
    // means "could not look".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(supabase, "notification_events", (q) =>
      (q as any).eq("event_type", "demand_interest_expressed"),
    ),
  ]);
  return {
    workers,
    companies,
    verifiedCompanies,
    openDemands,
    interestActive,
    interestReviewed,
    interestContacted,
    interestNotified,
  };
}
