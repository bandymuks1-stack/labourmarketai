import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  structureNeed,
  type NeedStructureSuggestion,
} from "@/lib/structuring/structure-need";

/**
 * Admin-only loader for the need-structuring backfill. Reads submitted demands
 * that still lack structured fields, and runs the DETERMINISTIC need-structuring
 * engine over their free text to produce a SUGGESTION the owner/admin reviews.
 *
 * The free text (role / description / location / notes) is shown ONLY in this
 * admin review surface — it is NEVER written anywhere a worker can see. Only the
 * suggestion's closed-set values can be applied to the structured columns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface UnstructuredNeed {
  readonly id: string;
  readonly title: string;
  /** Admin-only free-text context — never exposed to workers. */
  readonly freeText: {
    readonly role: string | null;
    readonly description: string | null;
    readonly location: string | null;
    readonly notes: string | null;
  };
  readonly suggestion: NeedStructureSuggestion;
  readonly current: {
    readonly roleOrWorkType: string | null;
    readonly country: string | null;
    readonly teamSize: number | null;
    readonly startPeriod: string | null;
  };
}

export async function loadUnstructuredNeeds(): Promise<UnstructuredNeed[]> {
  const supabase = await createClient();
  const { data } = await asAny(supabase)
    .from("customer_requests")
    .select(
      "id, title, need_summary, payload, role_or_work_type, country, team_size, start_period, status, created_at",
    )
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  return rows
    .filter((r) => !r.role_or_work_type || !r.country)
    .map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const freeText = {
        role: (payload.role as string | null) ?? null,
        description: (r.need_summary as string | null) ?? null,
        location: (payload.location as string | null) ?? null,
        notes: (payload.notes as string | null) ?? null,
      };
      return {
        id: String(r.id),
        title: String(r.title ?? "—"),
        freeText,
        suggestion: structureNeed(freeText),
        current: {
          roleOrWorkType: (r.role_or_work_type as string | null) ?? null,
          country: (r.country as string | null) ?? null,
          teamSize: (r.team_size as number | null) ?? null,
          startPeriod: (r.start_period as string | null) ?? null,
        },
      };
    });
}
