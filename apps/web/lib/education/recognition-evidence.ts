import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  buildEvidenceBySubject,
  type EvidenceBySubject,
  type EvidenceConfirmationRow,
  type EvidenceEntryRow,
  type StudentContextRow,
} from "./recognition-evidence-model";

/**
 * SKL-9 — the evidence an assessor may cite, read under the assessor's OWN
 * RLS (no new grant, no new function, no table change).
 *
 * What the institution can read, and therefore all this reads:
 *   · `engagement_contexts` of its own organisation (`manages_organization`),
 *   · `journal_entries` whose engagement context is one of those,
 *   · `journal_entry_confirmations` of those entries.
 * Entries a learner recorded in an EMPLOYER's context stay invisible to the
 * institution, exactly as before — the learner shows those by being recorded
 * in, or confirmed within, a context the institution is party to.
 *
 * A failed read is `unavailable`, never an empty list: "no confirmed practice
 * yet" and "could not be read" are different statements (SEP-7).
 */
export type RecognitionEvidenceRead =
  | { readonly status: "ok"; readonly bySubject: EvidenceBySubject }
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const ENTRY_LIMIT = 1000;
const CONTEXT_LIMIT = 500;
const CONFIRMATION_LIMIT = 5000;

export async function readRecognitionEvidence(organizationId: string): Promise<RecognitionEvidenceRead> {
  const supabase = await createClient();

  const ctxRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, profile_id")
    .eq("organization_id", organizationId)
    .eq("relationship_slug", "student")
    .in("status", ["active", "ended"])
    .limit(CONTEXT_LIMIT + 1);
  if (ctxRes.error) return { status: "unavailable" };
  const contexts = (ctxRes.data ?? []) as StudentContextRow[];
  // A capped read is not a complete read: "none yet" must never be inferred from it.
  if (contexts.length > CONTEXT_LIMIT) return { status: "unavailable" };
  if (contexts.length === 0) return { status: "ok", bySubject: {} };

  const entriesRes = await asAny(supabase)
    .from("journal_entries")
    .select("id, engagement_context_id, entry_type_slug, created_at, original_text")
    .in(
      "engagement_context_id",
      contexts.map((c) => c.id),
    )
    .is("deleted_at", null)
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(ENTRY_LIMIT + 1);
  if (entriesRes.error) return { status: "unavailable" };
  const entries = (entriesRes.data ?? []) as EvidenceEntryRow[];
  if (entries.length > ENTRY_LIMIT) return { status: "unavailable" };
  if (entries.length === 0) return { status: "ok", bySubject: {} };

  const confRes = await asAny(supabase)
    .from("journal_entry_confirmations")
    .select("entry_id, confirmer_id, created_at, confirmation_scope")
    .in(
      "entry_id",
      entries.map((e) => e.id),
    )
    .limit(CONFIRMATION_LIMIT + 1);
  if (confRes.error) return { status: "unavailable" };
  if ((confRes.data ?? []).length > CONFIRMATION_LIMIT) return { status: "unavailable" };

  return {
    status: "ok",
    bySubject: buildEvidenceBySubject(contexts, entries, (confRes.data ?? []) as EvidenceConfirmationRow[]),
  };
}
