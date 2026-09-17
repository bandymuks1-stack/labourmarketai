"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

// The evidence-import tables postdate the generated `Database` types — the
// same `asAny` escape `import-core.ts` uses for every one of them. It is a
// TYPE hole only: RLS still decides the write, and the action below re-derives
// every field it sends rather than trusting the form.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

/**
 * "THIS IS WRONG" — the subject's answer to a record an organization wrote
 * about them.
 *
 * ── WHY THIS COULD NOT EXIST BEFORE ────────────────────────────────────────
 * `deriveEvidenceStanding` has ranked DISPUTED second in its precedence order
 * since it was written, so the model computed a state no actor in the system
 * could cause. `organization_evidence_events` had exactly two INSERT policies
 * — `_attest` (organisation managers) and `_verify` (a third-party verifier
 * organisation) — and the person a record is ABOUT matched neither. Shipping
 * the button alone would have handed the one person it exists for a 42501.
 * The write path landed as migration `subject_contest_and_clash_receipt`
 * (production ledger `20260915185038`); this is the surface for it, and
 * nothing here invents authority the policy does not already grant.
 *
 * ── WHAT A DISPUTE IS, AND IS NOT ──────────────────────────────────────────
 * It is an event ALONGSIDE the record. It does not edit the employer's text,
 * it does not delete the row, and it cannot: `organization_evidence_records`
 * has no UPDATE and no DELETE policy, and this action writes only to the
 * events table. The record stays exactly as the organisation wrote it, and
 * the reader sees both — the claim and the objection.
 *
 * It is also not a verdict. A disputed record does not become false; it
 * becomes CONTESTED, which is a different and honest thing to be.
 *
 * ── THE SERVER RE-DERIVES EVERYTHING ───────────────────────────────────────
 * The client sends one record id. The organisation id is read back from the
 * record itself rather than accepted from the form, so a caller cannot aim a
 * dispute at one organisation while naming another. `actor_profile_id` is the
 * session's own user. Even if all of that were bypassed, the RLS policy
 * re-checks the subject link, the NULL actor_role / actor_organization_id and
 * the absent replacement record on its own.
 */

export type DisputeEvidenceResult =
  | { readonly ok: true }
  /** The unique index refused a second dispute by the same person on the same
   *  record. Not an error to show as one — the objection is already on file. */
  | { readonly ok: true; readonly already: true }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        /** RLS refused: not the subject, or the roster link is not `linked`. */
        | "not_allowed"
        | "not_found"
        | "needs_migration"
        | "error";
    };

/** Postgres codes this path can legitimately meet. */
const UNIQUE_VIOLATION = "23505";
const RLS_VIOLATION = "42501";
const UNDEFINED_TABLE = "42P01";

export async function disputeEvidenceRecordAction(
  _previous: DisputeEvidenceResult | null,
  form: FormData,
): Promise<DisputeEvidenceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const recordId = String(form.get("record_id") ?? "").trim();
  if (recordId === "") return { ok: false, code: "invalid" };

  // The note is the person's own words and is stored as written — no
  // translation column, no normalisation (doctrine §2). Empty stays NULL
  // rather than becoming an empty string that reads as a blank statement.
  const rawNote = String(form.get("note") ?? "").trim();
  if (rawNote.length > 1000) return { ok: false, code: "invalid" };
  const note = rawNote === "" ? null : rawNote;

  // The organisation comes from the RECORD, never from the form. This read is
  // RLS-scoped: a caller who cannot see the record gets nothing back, and the
  // action stops here rather than attempting a write.
  const found = await db(supabase)
    .from("organization_evidence_records")
    .select("id, organization_id")
    .eq("id", recordId)
    .maybeSingle();
  if (found.error) {
    return {
      ok: false,
      code: found.error.code === UNDEFINED_TABLE ? "needs_migration" : "error",
    };
  }
  if (!found.data) return { ok: false, code: "not_found" };

  const inserted = await db(supabase).from("organization_evidence_events").insert({
    organization_id: (found.data as { organization_id: string }).organization_id,
    record_id: recordId,
    event_type: "disputed",
    actor_profile_id: user.id,
    // Stated, not omitted: a dispute is a PERSON's statement. The table CHECK
    // requires actor_role NULL for this event type and the policy requires
    // actor_organization_id NULL — writing them explicitly keeps the intent
    // visible at the call site instead of relying on column defaults.
    actor_role: null,
    actor_organization_id: null,
    replacement_record_id: null,
    note,
  });

  if (inserted.error) {
    const code = inserted.error.code;
    // Already contested by this person. The unique index is doing exactly its
    // job, and the honest answer to the reader is "it is on file", not "error".
    if (code === UNIQUE_VIOLATION) return { ok: true, already: true };
    if (code === RLS_VIOLATION) return { ok: false, code: "not_allowed" };
    if (code === UNDEFINED_TABLE) return { ok: false, code: "needs_migration" };
    return { ok: false, code: "error" };
  }

  revalidatePath("/[locale]/dashboard/profile", "page");
  return { ok: true };
}
