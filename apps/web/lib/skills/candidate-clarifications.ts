import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Candidate skill clarifications — read service (slice skill-clarify-capture-v1).
 * Owner-scoped: a worker reads ONLY their own rows (RLS profile_id = auth.uid()).
 * These are self-declared / needs-clarification — never verified, never AI-mapped.
 * The write action lives in candidate-clarifications-actions.ts ("use server").
 */

const UNDEFINED_TABLE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface CandidateClarification {
  id: string;
  label: string;
  relatedTo: string | null;
  toolsMaterials: string | null;
  oftenWith: string | null;
}

export type ClarificationsRead =
  | { kind: "ok"; items: CandidateClarification[] }
  | { kind: "needs-migration" };

export async function listOwnCandidateClarifications(): Promise<ClarificationsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", items: [] };

  const res = await asAny(supabase)
    .from("skill_candidate_clarifications")
    .select("id, label, related_to, tools_materials, often_with")
    .order("created_at", { ascending: false });

  if (res.error) {
    if (res.error.code === UNDEFINED_TABLE) return { kind: "needs-migration" };
    return { kind: "ok", items: [] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: CandidateClarification[] = (res.data ?? []).map((r: any) => ({
    id: r.id,
    label: r.label,
    relatedTo: r.related_to ?? null,
    toolsMaterials: r.tools_materials ?? null,
    oftenWith: r.often_with ?? null,
  }));
  return { kind: "ok", items };
}
