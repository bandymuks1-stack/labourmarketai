import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import { isMissingSchemaCode } from "./programs";
import { toJoinableCohorts, type JoinableCohort } from "./cohort-join-model";

/**
 * J-12 learner read: groups open for join requests and the caller's own
 * requests (`list_open_education_cohorts_v1`, migration 20261102160000).
 *
 * Honest degradation: `not_available` while the function does not exist in
 * this database (the section then renders nothing), `unavailable` on any other
 * failure — never an empty list pretending there is nothing to join.
 */
export type CohortJoinRead =
  | { readonly status: "ok"; readonly cohorts: readonly JoinableCohort[] }
  | { readonly status: "not_available" }
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function readJoinableCohorts(): Promise<CohortJoinRead> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("list_open_education_cohorts_v1");
  if (error) return isMissingSchemaCode(error.code) ? { status: "not_available" } : { status: "unavailable" };
  return { status: "ok", cohorts: toJoinableCohorts((data ?? []) as Array<Record<string, unknown>>) };
}
