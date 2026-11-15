"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { untypedClient } from "./evidence-store";
import { duplicateNote } from "./duplicate-review-model";

/**
 * The organization's decisions on a possible duplicate (duplicate-review-model).
 * Both write the EXISTING append-only lifecycle events under the caller's own
 * RLS (hist_p4_events_insert: the organization's owner / admin / manager):
 * nothing is deleted or edited, and each decision has an exact inverse.
 */
export type DuplicateDecisionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "auth" | "invalid" | "not_found" | "not_same_work" | "not_allowed" | "already" | "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RLS_VIOLATION = "42501";

type RecordKey = {
  id: string;
  organization_id: string;
  organization_person_id: string | null;
  activity_date: string | null;
  work_object_id: string | null;
};

/** Is the record withdrawn now (the latest withdrawn / reinstated event)? */
async function isWithdrawn(db: ReturnType<typeof untypedClient>, recordId: string): Promise<boolean | null> {
  const res = await db
    .from("organization_evidence_events")
    .select("event_type, created_at")
    .eq("record_id", recordId)
    .in("event_type", ["withdrawn", "reinstated"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (res.error) return null;
  return ((res.data ?? []) as { event_type: string }[])[0]?.event_type === "withdrawn";
}

/** Mark `recordId` as a duplicate of `keptRecordId`: the same person, day and
 *  work object, the kept one still live. */
export async function markRecordDuplicateAction(input: {
  recordId: string;
  keptRecordId: string;
}): Promise<DuplicateDecisionResult> {
  if (!UUID.test(input.recordId) || !UUID.test(input.keptRecordId) || input.recordId === input.keptRecordId) {
    return { ok: false, code: "invalid" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  const db = untypedClient(supabase);
  const found = await db
    .from("organization_evidence_records")
    .select("id, organization_id, organization_person_id, activity_date, work_object_id, correction_of")
    .in("id", [input.recordId, input.keptRecordId]);
  if (found.error) return { ok: false, code: "error" };
  const rows = (found.data ?? []) as RecordKey[];
  const rec = rows.find((r) => r.id === input.recordId);
  const kept = rows.find((r) => r.id === input.keptRecordId);
  if (!rec || !kept) return { ok: false, code: "not_found" };
  if (
    rec.organization_id !== kept.organization_id ||
    !rec.organization_person_id ||
    rec.organization_person_id !== kept.organization_person_id ||
    !rec.activity_date ||
    rec.activity_date !== kept.activity_date ||
    !rec.work_object_id ||
    rec.work_object_id !== kept.work_object_id
  ) {
    return { ok: false, code: "not_same_work" };
  }
  const [recWithdrawn, keptWithdrawn] = await Promise.all([isWithdrawn(db, rec.id), isWithdrawn(db, kept.id)]);
  if (recWithdrawn === null || keptWithdrawn === null) return { ok: false, code: "error" };
  if (recWithdrawn) return { ok: false, code: "already" };
  if (keptWithdrawn) return { ok: false, code: "not_same_work" };

  const ins = await db.from("organization_evidence_events").insert({
    organization_id: rec.organization_id,
    record_id: rec.id,
    event_type: "withdrawn",
    actor_profile_id: user.id,
    actor_role: null,
    actor_organization_id: null,
    replacement_record_id: null,
    note: duplicateNote(kept.id),
  });
  if (ins.error) return { ok: false, code: ins.error.code === RLS_VIOLATION ? "not_allowed" : "error" };
  revalidatePath("/[locale]/dashboard/company/history", "page");
  return { ok: true };
}

/** Undo: the record counts again (the exact inverse of the decision above). */
export async function reinstateRecordAction(input: { recordId: string }): Promise<DuplicateDecisionResult> {
  if (!UUID.test(input.recordId)) return { ok: false, code: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  const db = untypedClient(supabase);
  const found = await db.from("organization_evidence_records").select("id, organization_id").eq("id", input.recordId).maybeSingle();
  if (found.error) return { ok: false, code: "error" };
  if (!found.data) return { ok: false, code: "not_found" };
  const withdrawn = await isWithdrawn(db, input.recordId);
  if (withdrawn === null) return { ok: false, code: "error" };
  if (!withdrawn) return { ok: false, code: "already" };
  const ins = await db.from("organization_evidence_events").insert({
    organization_id: (found.data as { organization_id: string }).organization_id,
    record_id: input.recordId,
    event_type: "reinstated",
    actor_profile_id: user.id,
    actor_role: null,
    actor_organization_id: null,
    replacement_record_id: null,
    note: "duplicate_decision_undone",
  });
  if (ins.error) return { ok: false, code: ins.error.code === RLS_VIOLATION ? "not_allowed" : "error" };
  revalidatePath("/[locale]/dashboard/company/history", "page");
  return { ok: true };
}
