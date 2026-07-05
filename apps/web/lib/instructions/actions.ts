"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  MESSAGE_RATE_CAP,
  evaluateRateCap,
  rateCapWindowStartIso,
} from "@/lib/communication/rate-caps";

/**
 * Work-instructions server actions (slice work-instructions-v1).
 *
 * - sendWorkInstructionAction → the SECURITY DEFINER, relationship-gated
 *   send_work_instruction RPC (migration 20260608150000). The manager writes in
 *   their own language; the ORIGINAL is stored verbatim. No fake translation.
 * - requestInstructionClarificationAction → a REAL worker-authored reply in the
 *   same thread (is_clarification_request = true), inserted through the existing
 *   participant-scoped message INSERT policy. No new RPC, no automation.
 *
 * Tagged returns (never throw across the boundary). `needs_migration` is surfaced
 * cleanly until the migration is applied.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

export type InstructionActionResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "invalid"
        | "auth"
        | "not_authorized"
        /** §8.2 abuse cap: windowed message rate limit reached, or the safety
         *  count could not be read (default-closed — never a bypass path). */
        | "rate_limited"
        | "error";
      message?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function migMissing(code?: string): boolean {
  return (
    code === RPC_NOT_FOUND ||
    code === UNDEFINED_COLUMN ||
    code === RELATION_NOT_FOUND
  );
}

/** Manager/foreman sends a work instruction to a worker they manage. */
export async function sendWorkInstructionAction(
  _prev: InstructionActionResult | null,
  formData: FormData,
): Promise<InstructionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const workerProfileId = String(formData.get("worker_profile_id") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const originalLanguage =
    String(formData.get("original_language") ?? "").trim() || null;
  // Optional project scope (F5): empty = team/roster-level (the unchanged
  // send_work_instruction RPC). When a project is chosen, route through the
  // separate project-scoped RPC, which requires the worker to be ACTIVELY
  // assigned to that project.
  const projectId = String(formData.get("project_id") ?? "").trim() || null;
  if (!workerProfileId || body.length === 0) {
    return { ok: false, code: "invalid" };
  }

  const { error } = projectId
    ? await asAny(supabase).rpc("send_work_instruction_to_project", {
        p_worker_profile_id: workerProfileId,
        p_body: body,
        p_original_language: originalLanguage,
        p_project_id: projectId,
      })
    : await asAny(supabase).rpc("send_work_instruction", {
        p_worker_profile_id: workerProfileId,
        p_body: body,
        p_original_language: originalLanguage,
      });

  if (error) {
    if (migMissing(error.code)) return { ok: false, code: "needs_migration" };
    // The RPC raises 42501 when the caller does not manage this worker.
    if (error.code === "42501")
      return { ok: false, code: "not_authorized" };
    console.error("[instructions] send failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Worker asks the manager to clarify an instruction. This is a real reply in the
 * same thread — the worker authors it (existing message INSERT policy:
 * author = auth.uid() AND participant). `body` carries the worker's localized
 * clarification text from the UI; nothing is invented server-side.
 */
export async function requestInstructionClarificationAction(
  conversationId: string,
  body: string,
): Promise<InstructionActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const text = (body ?? "").trim();
  if (!conversationId || text.length === 0) return { ok: false, code: "invalid" };

  // §8.2 abuse cap — same windowed message cap as the communication composer,
  // enforced BEFORE the insert (this is the one other app-side message-insert
  // path; no cap bypass). Default-closed: an unreadable count refuses the send.
  const { count: recentCount, error: capError } = await asAny(supabase)
    .from("conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id)
    .gte("created_at", rateCapWindowStartIso(MESSAGE_RATE_CAP));
  const capDecision = evaluateRateCap(
    capError ? null : typeof recentCount === "number" ? recentCount : null,
    MESSAGE_RATE_CAP,
  );
  if (capDecision !== "allowed") {
    if (capError) {
      console.error("[instructions] rate-cap count failed:", capError.code ?? "unknown");
    }
    return { ok: false, code: "rate_limited" };
  }

  const { error } = await asAny(supabase)
    .from("conversation_messages")
    .insert({
      conversation_id: conversationId,
      author_id: user.id,
      body: text.slice(0, 10000),
      is_clarification_request: true,
    });

  if (error) {
    if (migMissing(error.code)) return { ok: false, code: "needs_migration" };
    if (error.code === "42501") return { ok: false, code: "not_authorized" };
    console.error("[instructions] clarification failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
