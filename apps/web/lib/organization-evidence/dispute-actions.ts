"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  disputeEvidenceRecord,
  withdrawEvidenceRecordDispute,
} from "@/lib/organization-evidence/import-core";

/**
 * THE SUBJECT CONTESTS A RECORD AN ORGANIZATION WROTE ABOUT THEM — and can
 * take that contest back.
 *
 * Two acts, one form, no default. Contesting appends a `disputed` lifecycle
 * event; withdrawing appends its inverse. Neither touches the record itself:
 * the organization keeps what it wrote, the person's objection sits beside it,
 * and a reader sees both. That is the whole design — a contest is an answer,
 * not an erasure.
 *
 * The action re-derives the caller rather than trusting the form, and the
 * database refuses any record the caller is not the linked subject of.
 */

export type EvidenceDisputeActionResult =
  | { readonly ok: true; readonly disputed: boolean }
  | {
      readonly ok: false;
      readonly code:
        | "auth"
        | "invalid"
        | "not_found"
        | "needs_migration"
        | "error";
    };

export async function respondToEvidenceRecordAction(
  _previous: EvidenceDisputeActionResult | null,
  form: FormData,
): Promise<EvidenceDisputeActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const recordId = String(form.get("record_id") ?? "").trim();
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "");
  if (recordId === "" || (decision !== "dispute" && decision !== "withdraw")) {
    return { ok: false, code: "invalid" };
  }

  const caller = { supabase, userId: user.id, locale: undefined };
  const res =
    decision === "dispute"
      ? await disputeEvidenceRecord(caller, { recordId, note })
      : await withdrawEvidenceRecordDispute(caller, { recordId, note });

  if (res.kind !== "ok") {
    return {
      ok: false,
      code:
        res.kind === "needs-migration"
          ? "needs_migration"
          : res.kind === "not-found"
            ? "not_found"
            : res.kind === "invalid"
              ? "invalid"
              : "error",
    };
  }
  revalidatePath("/dashboard/profile");
  return { ok: true, disputed: decision === "dispute" };
}
