import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import {
  parseNeedPublicReasons,
  parseNeedPublicState,
  parsePublicCompanyNeedRows,
  type NeedPublicReason,
  type NeedPublicState,
  type PublicCompanyNeed,
} from "./public-company-needs-model";

export type { PublicCompanyNeed } from "./public-company-needs-model";

/**
 * PUBLIC COMPANY NEEDS — owner decision V-1 (2026-11-12).
 *
 * The ONE app door to `list_public_company_needs_v1`: the public /jobs section
 * and the MCP `jobs.search` capability both read through here, under the
 * caller's own client (anonymous on /jobs, the bearer on MCP), so neither can
 * widen what the database hands out.
 *
 * WHO IS SHOWN IS NOT DECIDED HERE. `need_public_state_v1` in the database is
 * the one rule (required fields, antispam checks, operator decisions); this
 * file only reads its result. `companyConfirmed` is false for every need of a
 * company that is not verified — the surfaces label it "Company not confirmed"
 * and never show a verification badge for it (SEP-3).
 *
 * Honest degradation: before the migration is applied the function does not
 * exist (42883 / PGRST202) → `not_provisioned`, and the surfaces render
 * nothing rather than an empty "no needs" claim.
 */
export type PublicCompanyNeedsResult =
  | { readonly status: "ok"; readonly needs: readonly PublicCompanyNeed[] }
  | { readonly status: "not_provisioned"; readonly needs: readonly [] }
  | { readonly status: "unavailable"; readonly needs: readonly [] };

const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export async function listPublicCompanyNeeds(
  input: { readonly query?: string | null; readonly country?: string | null },
  suppliedClient?: SupabaseClient,
): Promise<PublicCompanyNeedsResult> {
  const query = typeof input.query === "string" && input.query.trim() !== "" ? input.query.trim().slice(0, 80) : null;
  const country = typeof input.country === "string" && /^[A-Z]{2}$/.test(input.country) ? input.country : null;
  try {
    const supabase = suppliedClient ?? (await createClient());
    const { data, error } = (await asAny(supabase).rpc("list_public_company_needs_v1", {
      p_query: query,
      p_country: country,
    })) as { data: unknown; error: { code?: string } | null };
    if (error) {
      if (error.code && MISSING_FUNCTION.has(error.code)) return { status: "not_provisioned", needs: [] };
      return { status: "unavailable", needs: [] };
    }
    return { status: "ok", needs: parsePublicCompanyNeedRows(data) };
  } catch {
    return { status: "unavailable", needs: [] };
  }
}

/**
 * The company's OWN readback (owner decision V-1): for each of its needs,
 * what the one rule says — shown, waiting for review (and why) or rejected.
 * `get_my_need_public_states_v1` returns rows only for needs the caller owns
 * or manages, so this cannot read another company's state.
 *
 * `provisioned` says whether the V-1 rule exists in this database at all. The
 * copy depends on it: until the owner applies the migration, needs of an
 * unconfirmed company are still NOT shown, and the page must keep saying so.
 * Absent function or any error → not provisioned, empty map.
 */
export type MyNeedPublicStates = {
  readonly provisioned: boolean;
  readonly states: ReadonlyMap<string, { state: NeedPublicState; reasons: NeedPublicReason[] }>;
};

export async function readMyNeedPublicStates(
  requestIds: readonly string[],
  suppliedClient?: SupabaseClient,
): Promise<MyNeedPublicStates> {
  const ids = requestIds.filter((id) => UUID_RE.test(id)).slice(0, 200);
  const out = new Map<string, { state: NeedPublicState; reasons: NeedPublicReason[] }>();
  // Called even with no ids: an empty array answers "provisioned" without rows.
  try {
    const supabase = suppliedClient ?? (await createClient());
    const { data, error } = (await asAny(supabase).rpc("get_my_need_public_states_v1", {
      p_request_ids: ids,
    })) as { data: unknown; error: unknown };
    if (error || !Array.isArray(data)) return { provisioned: false, states: out };
    for (const raw of data as Record<string, unknown>[]) {
      const state = parseNeedPublicState(raw?.state);
      if (typeof raw?.request_id !== "string" || state === null) continue;
      out.set(raw.request_id, { state, reasons: parseNeedPublicReasons(raw.reasons) });
    }
  } catch {
    return { provisioned: false, states: out };
  }
  return { provisioned: true, states: out };
}
