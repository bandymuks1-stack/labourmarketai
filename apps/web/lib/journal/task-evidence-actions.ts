"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMigrationMissingCode } from "@/lib/tasks/task-model";
import {
  UNLINK_REASON_MAX,
  isLinkResultCode,
} from "@/lib/journal/task-evidence-model";

/**
 * Task evidence write actions (field-work audit v1, P0 train).
 *
 * The ONLY write paths are the two gated SECURITY DEFINER RPCs from
 * 20260819190000_journal_task_evidence_link_v1:
 *
 *   - link_journal_entry_to_task_v1(p_entry_id, p_task_id)
 *   - unlink_journal_entry_from_task_v1(p_link_id, p_reason)
 *
 * Both re-check authorization server-side against the CALLER's visibility of
 * the entry AND of the task, and both answer 'not_found' for rows the caller
 * cannot see — so nothing here can be used to probe for existence.
 *
 * These actions never create, edit, confirm or approve a journal entry. They
 * only record "this existing evidence proves that task", and record the
 * withdrawal of that claim (§4.3 — revocation is a row, not a delete).
 *
 * Honest degradation: while the owner-gated migration is unapplied the RPCs
 * are missing (42883/PGRST202) and the action reports `needs_migration`
 * instead of pretending the link was saved.
 *
 * NATIVE-NAV forms: every action redirects back to the tasks page with a
 * validated `?notice=` outcome (the task-actions precedent) — no client
 * state, no optimistic UI, no fabricated success.
 */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Notice =
  | "evidence_linked"
  | "evidence_unlinked"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "limit_reached"
  | "error";

type FormContext = {
  locale: string;
  view: string | null;
  project: string | null;
};

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    view: formData.get("view") === "board" ? "board" : null,
    project: String(formData.get("project") ?? "") || null,
  };
}

/** Rebuild the tasks-page URL from VALIDATED parts only (never raw input). */
function tasksUrl(ctx: FormContext, notice: Notice): string {
  const params = new URLSearchParams();
  if (ctx.view === "board") params.set("view", "board");
  if (ctx.project && UUID_RX.test(ctx.project)) {
    params.set("project", ctx.project);
  }
  params.set("notice", notice);
  return `/${ctx.locale}/dashboard/tasks?${params.toString()}`;
}

function noticeForRpcError(error: { code?: string }): Notice {
  if (isMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

/** Map the RPC's outcome word onto the page's notice vocabulary. */
function noticeForOutcome(outcome: string, ok: Notice): Notice {
  if (!isLinkResultCode(outcome)) return "error";
  switch (outcome) {
    // `already_linked` / `already_unlinked` are idempotent successes: the
    // world is in the state the user asked for. Reporting an error there
    // would be dishonest in the opposite direction.
    case "ok":
    case "already_linked":
    case "already_unlinked":
      return ok;
    case "not_allowed":
      return "not_authorized";
    case "not_found":
      return "not_found";
    case "limit_reached":
      return "limit_reached";
    case "entry_not_current":
    case "invalid":
      return "invalid";
  }
}

function finish(ctx: FormContext, notice: Notice): never {
  if (notice === "evidence_linked" || notice === "evidence_unlinked") {
    revalidatePath("/", "layout");
  }
  redirect(tasksUrl(ctx, notice));
}

/** Attach one of the caller's OWN journal entries to a task as evidence. */
export async function linkTaskEvidenceAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  const entryId = String(formData.get("entryId") ?? "").trim();
  if (!UUID_RX.test(taskId) || !UUID_RX.test(entryId)) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "link_journal_entry_to_task_v1",
    { p_entry_id: entryId, p_task_id: taskId },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  finish(ctx, noticeForOutcome(String(data ?? ""), "evidence_linked"));
}

/** Withdraw an evidence claim. The link row stays forever (§4.3). */
export async function unlinkTaskEvidenceAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const linkId = String(formData.get("linkId") ?? "").trim();
  if (!UUID_RX.test(linkId)) finish(ctx, "invalid");

  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, UNLINK_REASON_MAX);

  const { data, error } = await asAny(supabase).rpc(
    "unlink_journal_entry_from_task_v1",
    { p_link_id: linkId, p_reason: reason },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  finish(ctx, noticeForOutcome(String(data ?? ""), "evidence_unlinked"));
}
