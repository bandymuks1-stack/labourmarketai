import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The accepted-booking → engagement INVARIANT (beta stabilization §7).
 *
 * WHY THIS EXISTS. On 2026-08-06 a real production booking was accepted and
 * minted no engagement — `respond_booking_request_v3` hit the multi-company
 * `ambiguous_company` branch — and nothing in the product said a word. The
 * defect was found two days later by a human reading raw row counts. The
 * fix (org-first resolution, 20260807140000) closes the mechanism; THIS
 * module closes the silence: the non-mint outcome lives only in the RPC's
 * transient response, so an operator needs a query that re-derives, at any
 * later time, whether every accepted booking reached the engagement it was
 * supposed to reach.
 *
 * WHAT IT IS. One RLS-scoped read pass that MIRRORS the resolution rule of
 * `respond_booking_request_v3` (org-first via `organizations.
 * legacy_company_id`, then the profile-singleton fallback) and classifies
 * every accepted booking:
 *
 *   engaged           — an engagement row exists for this booking;
 *   covered_active    — no row for THIS booking, but the resolved
 *                       (company, worker) pair holds an active engagement
 *                       (the RPC's `already_active` arm) — satisfied;
 *   honest_non_mint   — the resolution rule itself says no engagement may
 *                       be created (company-less org, NULL-org multi-company
 *                       owner, broken origin invariant) — not a violation,
 *                       but listed, because "honest" must still be VISIBLE;
 *   VIOLATION         — the rule resolves a company and no engagement
 *                       exists for the booking or the pair. This is the
 *                       2026-08-06 silence, made loud.
 *
 * WHAT IT IS NOT. Not a repair tool — it mutates nothing. Not a user-facing
 * surface — it feeds the admin project-truth page. Not a second resolution
 * authority: if this module and the RPC ever disagree, the RPC is canonical
 * and the disagreement itself is what the admin needs to see.
 *
 * AUTHORIZATION. Ordinary authenticated reads. Every table consulted
 * (`booking_requests`, `customer_requests`, `organizations`, `companies`,
 * `company_worker_engagements`) carries an `is_admin()` SELECT arm, so an
 * admin session sees everything and a non-admin session sees only their own
 * slice — the module never widens anything to make itself work.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const MISSING_RELATION = new Set(["42P01", "PGRST205", "42703"]);

/** Bounded read — the invariant is a truth surface, not a batch job. */
const BOOKING_SCAN_LIMIT = 500;

export type EngagementInvariantStatus =
  | "engaged"
  | "covered_active"
  | "honest_non_mint"
  | "VIOLATION";

export interface EngagementInvariantRow {
  readonly bookingId: string;
  readonly workerId: string;
  readonly status: EngagementInvariantStatus;
  /** For honest_non_mint: WHICH rule refused (mirrors the RPC vocabulary). */
  readonly reason:
    | "org_without_company"
    | "ambiguous_company"
    | "no_company"
    | "broken_origin"
    | null;
  /** The company the rule resolved to, when it resolved one. */
  readonly resolvedCompanyId: string | null;
}

export type EngagementInvariantResult =
  | { readonly status: "unavailable" } /* a consulted relation is absent */
  | { readonly status: "error" }
  | {
      readonly status: "ok";
      readonly acceptedCount: number;
      readonly rows: readonly EngagementInvariantRow[];
      /** The single number an operator needs: how many accepted bookings
       *  should have an engagement and don't. Zero or the page goes red. */
      readonly violationCount: number;
    };

export async function checkEngagementInvariant(): Promise<EngagementInvariantResult> {
  const supabase = await createClient();

  const bookingsRes = await (supabase as AnyClient)
    .from("booking_requests")
    .select("id, worker_id, owner_id, request_id")
    .eq("status", "accepted")
    .order("created_at", { ascending: true })
    .limit(BOOKING_SCAN_LIMIT);
  if (bookingsRes.error) {
    return MISSING_RELATION.has(bookingsRes.error.code ?? "")
      ? { status: "unavailable" }
      : { status: "error" };
  }

  type BookingRow = {
    id: string;
    worker_id: string;
    owner_id: string;
    request_id: string;
  };
  const bookings = (bookingsRes.data ?? []) as BookingRow[];
  if (bookings.length === 0) {
    return { status: "ok", acceptedCount: 0, rows: [], violationCount: 0 };
  }

  const requestIds = [...new Set(bookings.map((b) => b.request_id))];
  const [demandsRes, engagementsRes] = await Promise.all([
    (supabase as AnyClient)
      .from("customer_requests")
      .select("id, profile_id, organization_id")
      .in("id", requestIds),
    (supabase as AnyClient)
      .from("company_worker_engagements")
      .select("company_id, worker_id, source_booking_id, status")
      .limit(BOOKING_SCAN_LIMIT * 2),
  ]);
  for (const res of [demandsRes, engagementsRes]) {
    if (res.error) {
      return MISSING_RELATION.has(res.error.code ?? "")
        ? { status: "unavailable" }
        : { status: "error" };
    }
  }

  type DemandRow = { id: string; profile_id: string | null; organization_id: string | null };
  const demandById = new Map<string, DemandRow>(
    ((demandsRes.data ?? []) as DemandRow[]).map((d) => [d.id, d]),
  );

  type EngagementRow = {
    company_id: string;
    worker_id: string;
    source_booking_id: string | null;
    status: string;
  };
  const engagements = (engagementsRes.data ?? []) as EngagementRow[];
  const byBooking = new Set(
    engagements.filter((e) => e.source_booking_id).map((e) => e.source_booking_id as string),
  );
  const activePairs = new Set(
    engagements.filter((e) => e.status === "active").map((e) => `${e.company_id}:${e.worker_id}`),
  );

  // Org → canonical company, and owner → company list, resolved in bulk.
  const orgIds = [
    ...new Set(
      [...demandById.values()].map((d) => d.organization_id).filter((v): v is string => !!v),
    ),
  ];
  const ownerIds = [
    ...new Set([...demandById.values()].map((d) => d.profile_id).filter((v): v is string => !!v)),
  ];
  const [orgsRes, companiesRes] = await Promise.all([
    orgIds.length
      ? (supabase as AnyClient)
          .from("organizations")
          .select("id, legacy_company_id")
          .in("id", orgIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? (supabase as AnyClient).from("companies").select("id, profile_id").in("profile_id", ownerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const res of [orgsRes, companiesRes]) {
    if (res.error) {
      return MISSING_RELATION.has(res.error.code ?? "")
        ? { status: "unavailable" }
        : { status: "error" };
    }
  }
  const companyByOrg = new Map<string, string | null>(
    ((orgsRes.data ?? []) as { id: string; legacy_company_id: string | null }[]).map((o) => [
      o.id,
      o.legacy_company_id,
    ]),
  );
  const companiesByOwner = new Map<string, string[]>();
  for (const c of (companiesRes.data ?? []) as { id: string; profile_id: string }[]) {
    const list = companiesByOwner.get(c.profile_id) ?? [];
    list.push(c.id);
    companiesByOwner.set(c.profile_id, list);
  }

  /** MIRRORS respond_booking_request_v3's resolution, decision for decision. */
  const resolve = (
    b: BookingRow,
  ): { company: string | null; reason: EngagementInvariantRow["reason"] } => {
    const demand = demandById.get(b.request_id);
    if (!demand || !demand.profile_id || demand.profile_id !== b.owner_id) {
      return { company: null, reason: "broken_origin" };
    }
    if (demand.organization_id) {
      const company = companyByOrg.get(demand.organization_id) ?? null;
      return company
        ? { company, reason: null }
        : { company: null, reason: "org_without_company" };
    }
    const owned = companiesByOwner.get(demand.profile_id) ?? [];
    if (owned.length === 0) return { company: null, reason: "no_company" };
    if (owned.length > 1) return { company: null, reason: "ambiguous_company" };
    return { company: owned[0], reason: null };
  };

  const rows: EngagementInvariantRow[] = bookings.map((b) => {
    const { company, reason } = resolve(b);
    if (byBooking.has(b.id)) {
      return { bookingId: b.id, workerId: b.worker_id, status: "engaged", reason: null, resolvedCompanyId: company };
    }
    if (company === null) {
      return { bookingId: b.id, workerId: b.worker_id, status: "honest_non_mint", reason, resolvedCompanyId: null };
    }
    if (activePairs.has(`${company}:${b.worker_id}`)) {
      return { bookingId: b.id, workerId: b.worker_id, status: "covered_active", reason: null, resolvedCompanyId: company };
    }
    return { bookingId: b.id, workerId: b.worker_id, status: "VIOLATION", reason: null, resolvedCompanyId: company };
  });

  return {
    status: "ok",
    acceptedCount: bookings.length,
    rows,
    violationCount: rows.filter((r) => r.status === "VIOLATION").length,
  };
}
