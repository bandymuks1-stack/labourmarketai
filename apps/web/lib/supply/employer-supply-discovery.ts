import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * AVAILABLE WORKFORCE AN EMPLOYER CAN DISCOVER — the supply side of the market.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Six surfaces have been fixed for serving SUPPLY where DEMAND belongs, and
 * every one of those fixes was subtractive. Subtracting is half a market.
 *
 * Measured on production 2026-09-07: three real `agency_offer` rows exist, and
 * `customer_requests_select` is `profile_id = auth.uid() OR is_admin() OR
 * has_org_demand_access(organization_id)`. So the only readers of an agency's
 * declared capacity are that agency and an admin. **No employer on this
 * platform could discover available workforce at all.** The supply side was
 * written and unreadable — which is also what made declaring it pointless.
 *
 * ── WHAT A CALLER LEARNS, AND WHAT THEY DO NOT ─────────────────────────────
 * Six non-identifying columns: the kind of work, the country, how many people,
 * from when, for how long, and when it was declared. NOT the supplying
 * organization's name, NOT the profile behind it, NOT notes, NOT payload, NOT
 * contact details — the same anonymised posture the scouting surface takes
 * toward individual workers. Making contact stays a separate, consented act
 * and this read creates no path to one.
 *
 * ── AUTHORITY IS THE DATABASE'S ────────────────────────────────────────────
 * `list_open_supply_for_employers()` is a gated `SECURITY DEFINER` read that
 * requires the caller to manage an organization and never returns their own
 * side's rows. This module adds no authority — it calls the one door and
 * translates the result. A caller who manages nothing gets zero rows from the
 * function itself, not from a check here.
 *
 * ── HONEST STATES ──────────────────────────────────────────────────────────
 * The migration behind this is APPLIED to production (owner-approved 2026-09-07
 * as decision DEM-9, ledger version `20260907180546`). `needs-migration` is
 * therefore no longer the expected state on production — but it is KEPT, and
 * must be, because it is still the truth in any environment where the function
 * is absent (a fresh local reset, a preview branch, a rollback). It is reported
 * as itself — never as "no workforce is available", which would be a lie about
 * the market rather than a fact about this environment (#1314, §54).
 *
 * VERIFIED AGAINST THE LIVE FUNCTION, 2026-09-08, under four real auth
 * contexts: a manager of two organizations who authored neither row read 2 of
 * 2; the agency that authored one read 1 of 2 (self-exclusion); a manager of
 * one organization read 2 of 2; a person who manages nothing read 0 with no
 * error; `anon` is refused `42501` at the privilege level rather than filtered
 * inside the body. Authorization fails closed AND quietly, which is what lets
 * the empty state below be rendered without distinguishing "no supply" from
 * "not allowed".
 */

/** The gated read's row, as the product reads it. */
export interface AvailableSupplyRow {
  readonly id: string;
  /** The work the people can do, as the supplier wrote it. May be absent. */
  readonly roleText: string | null;
  readonly country: string | null;
  /** How many people. Absent when the supplier did not say. */
  readonly teamSize: number | null;
  readonly startPeriod: string | null;
  readonly duration: string | null;
  readonly declaredAt: string;
}

export type EmployerSupplyState =
  | { readonly kind: "ok"; readonly rows: readonly AvailableSupplyRow[] }
  /** The gated read is not provisioned in this environment. NOT "no supply". */
  | { readonly kind: "needs-migration" }
  /** No session. */
  | { readonly kind: "unauthenticated" }
  /** A real read failure. NEVER rendered as an empty market. */
  | { readonly kind: "error" };

/** Postgres/PostgREST codes that mean "the function is not there", as opposed
 *  to "it ran and refused". */
const MISSING_FUNCTION_CODES = new Set(["42883", "42P01", "PGRST202", "PGRST205"]);

// The RPC postdates the generated Database types until the migration is
// applied — the same `asAny` pattern every gated read uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * List the available workforce this caller may discover.
 *
 * `limit` bounds what is rendered; the function itself caps at 100 regardless,
 * so a caller can never widen the read by asking for more.
 */
export async function listAvailableSupplyForEmployer(
  opts: { readonly limit?: number } = {},
): Promise<EmployerSupplyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { data, error } = await asAny(supabase).rpc("list_open_supply_for_employers");
  if (error) {
    if (MISSING_FUNCTION_CODES.has(error.code ?? "")) return { kind: "needs-migration" };
    // The code only — never a Postgres message at a person.
    console.error("[supply] employer discovery read failed:", error.code);
    return { kind: "error" };
  }

  const cap = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  return {
    kind: "ok",
    rows: ((data ?? []) as Record<string, unknown>[]).slice(0, cap).map(
      (r): AvailableSupplyRow => ({
        id: r.id as string,
        roleText: toText(r.role_text),
        country: toText(r.country),
        teamSize: toNumber(r.team_size),
        startPeriod: toText(r.start_period),
        duration: toText(r.duration),
        declaredAt: (r.created_at as string) ?? "",
      }),
    ),
  };
}
