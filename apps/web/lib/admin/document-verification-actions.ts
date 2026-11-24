"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { revalidatePath } from "next/cache";

/**
 * Admin verify / reject of a worker document (Stage 9). Calls the PR2
 * admin_set_worker_document_verification RPC — the ONLY path to a `verified`
 * state, which stamps verified_by + verified_at and writes an append-only
 * event (NO fake verification). Degrades to needs-migration until applied.
 */

const ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type AdminDocResult =
  | { kind: "ok"; decision: string }
  | { kind: "needs-migration" }
  | { kind: "not-admin" }
  | { kind: "error"; message: string };

export async function setDocumentVerificationAction(input: {
  locale: string;
  documentId: string;
  decision: "verified" | "rejected" | "pending";
  note?: string;
}): Promise<AdminDocResult> {
  if (!(await isSuperadmin())) return { kind: "not-admin" };
  const supabase = await createClient();
  const { error } = await asAny(supabase).rpc("admin_set_worker_document_verification", {
    p_document_id: input.documentId,
    p_decision: input.decision,
    p_note: input.note ?? "",
  });
  if (error) {
    if (error.code && ABSENT.has(error.code)) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  revalidatePath(`/${input.locale}/dashboard/admin/readiness`);
  return { kind: "ok", decision: input.decision };
}
