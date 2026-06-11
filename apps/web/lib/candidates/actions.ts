"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  CANDIDATE_DRAFT_STATUSES,
  type CandidateDraftInput,
} from "@/lib/candidates/candidate-draft-types";

/**
 * Candidate / provider draft write actions (slice candidate-provider-draft-v1).
 *
 * Owner-scoped: every write carries owner_id = auth.uid() and the owner-only RLS
 * is the gate (no cross-owner write). These actions ONLY touch candidate_drafts
 * — they never create a user account, send an invite/acceptance, record consent,
 * verify anything, or attach a document. Tagged returns (Next 15 strips thrown
 * server-action Error messages in prod); needs_migration surfaced cleanly until
 * the v1 migration applies.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

export type CandidateDraftActionResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}
function migMissing(code?: string): boolean {
  return code === RPC_NOT_FOUND || code === UNDEFINED_COLUMN || code === RELATION_NOT_FOUND;
}
function mapError(code?: string, message?: string): CandidateDraftActionResult {
  if (migMissing(code)) return { ok: false, code: "needs_migration" };
  if (code === "42501") return { ok: false, code: "not_authorized" };
  return { ok: false, code: "error", message };
}

function clean(v: string | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
}

export async function createCandidateDraftAction(
  input: CandidateDraftInput,
): Promise<CandidateDraftActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const nameOrTitle = (input.nameOrTitle ?? "").trim();
  if (nameOrTitle === "") return { ok: false, code: "invalid" };
  const status =
    input.status && (CANDIDATE_DRAFT_STATUSES as readonly string[]).includes(input.status)
      ? input.status
      : "draft";

  const { data, error } = await asAny(supabase)
    .from("candidate_drafts")
    .insert({
      owner_id: user.id,
      name_or_title: nameOrTitle.slice(0, 160),
      contact: clean(input.contact, 200),
      profession_service: clean(input.professionService, 160),
      language: clean(input.language, 80),
      skills_text: clean(input.skillsText, 2000),
      notes: clean(input.notes, 2000),
      status,
      project_id: clean(input.projectId, 100),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[candidates] create failed:", error.message);
    return mapError(error.code, error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true, id: data?.id };
}

export async function updateCandidateDraftAction(
  id: string,
  input: CandidateDraftInput,
): Promise<CandidateDraftActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!id?.trim()) return { ok: false, code: "invalid" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.nameOrTitle !== undefined) {
    const n = input.nameOrTitle.trim();
    if (n === "") return { ok: false, code: "invalid" };
    patch.name_or_title = n.slice(0, 160);
  }
  if (input.contact !== undefined) patch.contact = clean(input.contact, 200);
  if (input.professionService !== undefined)
    patch.profession_service = clean(input.professionService, 160);
  if (input.language !== undefined) patch.language = clean(input.language, 80);
  if (input.skillsText !== undefined) patch.skills_text = clean(input.skillsText, 2000);
  if (input.notes !== undefined) patch.notes = clean(input.notes, 2000);
  if (input.status !== undefined) {
    if (!(CANDIDATE_DRAFT_STATUSES as readonly string[]).includes(input.status)) {
      return { ok: false, code: "invalid" };
    }
    patch.status = input.status;
  }

  // owner_id is NOT in the patch — RLS (owner_id = auth.uid()) scopes the row.
  const { error } = await asAny(supabase)
    .from("candidate_drafts")
    .update(patch)
    .eq("id", id);
  if (error) {
    console.error("[candidates] update failed:", error.message);
    return mapError(error.code, error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteCandidateDraftAction(
  id: string,
): Promise<CandidateDraftActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!id?.trim()) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).from("candidate_drafts").delete().eq("id", id);
  if (error) {
    console.error("[candidates] delete failed:", error.message);
    return mapError(error.code, error.message);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
