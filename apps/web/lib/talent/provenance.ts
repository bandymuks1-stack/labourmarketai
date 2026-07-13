import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingTableCode,
  parseConsentStatus,
  parseTalentSourceType,
  type TalentSourceRecord,
} from "./provenance-model";

/**
 * Read service for the signed-in person's OWN provenance ledger — the
 * talent_source_records table from DRAFT migration
 * 20260713210000_multi_source_talent_v1 (human-gated, NOT applied yet).
 *
 * Self-view only ("where does my data come from"): RLS restricts SELECT to
 * subject-or-admin, and this module reads only the caller's own rows. No
 * company/agency surface may call this to inspect another person's sources.
 *
 * Graceful degradation: until the owner applies the draft migration the
 * table does not exist and PostgREST answers 42P01 — we surface
 * `kind: "needs-migration"` so any consumer explains itself honestly.
 */

// talent_source_records is not in the generated Database type until the
// draft is applied and `pnpm db:types` runs — cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type TalentSourcesRead =
  | { kind: "ok"; records: TalentSourceRecord[] }
  | { kind: "needs-migration" }
  | { kind: "unauthenticated" };

/** Load the signed-in person's own talent-source (provenance) records. */
export async function getOwnTalentSources(): Promise<TalentSourcesRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { data, error } = await asAny(supabase)
    .from("talent_source_records")
    .select(
      "id, source_type, source_name, source_reference, consent_status, first_seen_at, last_confirmed_at, import_method",
    )
    .eq("subject_profile_id", user.id)
    .order("first_seen_at", { ascending: true });

  if (error) {
    if (isMissingTableCode(error.code)) {
      return { kind: "needs-migration" };
    }
    console.error("[talent-provenance] read failed:", error.code, error.message);
    return { kind: "ok", records: [] };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const records = rows
    .map((r): TalentSourceRecord | null => {
      // Closed-vocabulary validation — drifted DB values are dropped, never
      // rendered as unknown chips.
      const sourceType = parseTalentSourceType(r.source_type as string | null);
      const consentStatus = parseConsentStatus(r.consent_status as string | null);
      if (!sourceType || !consentStatus) return null;
      return {
        id: r.id as string,
        sourceType,
        sourceName: (r.source_name as string | null) ?? null,
        sourceReference: (r.source_reference as string | null) ?? null,
        consentStatus,
        firstSeenAt: r.first_seen_at as string,
        lastConfirmedAt: (r.last_confirmed_at as string | null) ?? null,
        importMethod: (r.import_method as string | null) ?? null,
      };
    })
    .filter((r): r is TalentSourceRecord => r !== null);

  return { kind: "ok", records };
}
