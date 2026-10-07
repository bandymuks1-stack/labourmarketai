"use server";

import "server-only";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  decideCounterpartyCore,
  submitEntryCore,
  validateDecisionInput,
} from "./counterparty-core";
import {
  isPartyRole,
  isUuid,
  registerOutcomeKey,
  revokeOutcomeKey,
} from "./counterparty-review-model";

/**
 * COUNTERPARTY REVIEW - the WRITE side (EVID-2 slice 2).
 *
 * Every action here is a thin, untrusting wrapper over ONE SECURITY DEFINER
 * function. The caller is re-derived inside the database from the session
 * (`auth.uid()`); nothing the browser sends is an identity or an authority:
 *
 *   register / revoke   -> register_work_counterparty_link_v1 /
 *                          revoke_work_counterparty_link_v1 (only the
 *                          counterparty organization's own representative,
 *                          from a REAL active assignment; never the subject)
 *   submit              -> submit_journal_entry_for_review_v1 (only the
 *                          subject; resolves the counterparty server-side)
 *   decide              -> review_journal_entry (authority resolved from the
 *                          work relationship; the subject can never be their
 *                          own counterparty)
 *
 * A refusal is returned as a stable `code`, never swallowed and never turned
 * into success. There is deliberately NO historical / reconstructed write
 * path here: the database refuses historical origins on platform rows.
 */

export type LinkActionState =
  | { ok: true; code: string }
  | { ok: false; code: string };

export type SubmitActionState =
  | { ok: true; code: "submitted" | "already_submitted" }
  | { ok: false; code: string };

export type DecideActionState =
  | { ok: true; decision: "approved" | "changes_requested" | "rejected" }
  | { ok: false; code: string };

const RPC_MISSING = "42883";

function localeOf(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "");
  return /^[a-z]{2}$/.test(raw) ? raw : "lt";
}

function failure(error: { code?: string; message?: string } | null): { ok: false; code: string } {
  return { ok: false, code: error?.code === RPC_MISSING ? "needs_migration" : "error" };
}

async function sessionClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ── A. project page ─────────────────────────────────────────────────────────

export async function registerCounterpartyLink(
  _prev: LinkActionState | null,
  formData: FormData,
): Promise<LinkActionState> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const workerId = String(formData.get("worker_id") ?? "").trim();
  const partyRole = String(formData.get("party_role") ?? "client").trim();
  const locale = localeOf(formData);
  if (!isUuid(projectId) || !isUuid(workerId)) return { ok: false, code: "error" };
  if (!isPartyRole(partyRole)) return { ok: false, code: "invalid_party_role" };

  const { supabase, user } = await sessionClient();
  if (!user) return { ok: false, code: "not_authorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("register_work_counterparty_link_v1", {
    p_project_id: projectId,
    p_worker_id: workerId,
    p_party_role: partyRole,
  });
  if (error) return failure(error);
  const code = registerOutcomeKey(String(data));
  revalidatePath(`/${locale}/dashboard/projects/${projectId}`);
  return code === "registered" || code === "already_registered"
    ? { ok: true, code }
    : { ok: false, code };
}

export async function revokeCounterpartyLink(
  _prev: LinkActionState | null,
  formData: FormData,
): Promise<LinkActionState> {
  const linkId = String(formData.get("link_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const locale = localeOf(formData);
  if (!isUuid(linkId)) return { ok: false, code: "error" };

  const { supabase, user } = await sessionClient();
  if (!user) return { ok: false, code: "not_authorized" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("revoke_work_counterparty_link_v1", {
    p_link_id: linkId,
  });
  if (error) return failure(error);
  const code = revokeOutcomeKey(String(data));
  if (isUuid(projectId)) revalidatePath(`/${locale}/dashboard/projects/${projectId}`);
  revalidatePath(`/${locale}/dashboard/journal`);
  return code === "revoked" || code === "already_revoked"
    ? { ok: true, code }
    : { ok: false, code };
}

// ── B. the worker's journal ─────────────────────────────────────────────────

export async function submitEntryForReview(
  _prev: SubmitActionState | null,
  formData: FormData,
): Promise<SubmitActionState> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const linkRaw = String(formData.get("link_id") ?? "").trim();
  const locale = localeOf(formData);
  if (!isUuid(entryId)) return { ok: false, code: "error" };
  // The link is optional (the database resolves the single valid
  // counterparty); when the subject picked one it must at least be an id.
  if (linkRaw !== "" && !isUuid(linkRaw)) return { ok: false, code: "error" };

  const { supabase, user } = await sessionClient();
  if (!user) return { ok: false, code: "not_authorized" };

  // The ONE core shared with the chat / MCP capability.
  const result = await submitEntryCore(supabase, {
    entryId,
    linkId: linkRaw === "" ? null : linkRaw,
  });
  revalidatePath(`/${locale}/dashboard/journal`);
  return result;
}

// ── C. the counterparty's queue ─────────────────────────────────────────────

export async function decideCounterpartyEntry(
  _prev: DecideActionState | null,
  formData: FormData,
): Promise<DecideActionState> {
  const locale = localeOf(formData);
  const checked = validateDecisionInput({
    entryId: String(formData.get("entry_id") ?? "").trim(),
    decision: String(formData.get("decision") ?? "").trim(),
    note: String(formData.get("note") ?? ""),
  });
  if (!checked.ok) return checked;

  const { supabase, user } = await sessionClient();
  if (!user) return { ok: false, code: "not_authorized" };

  // The ONE core shared with the chat / MCP capability: re-derives the
  // caller's queue, calls review_journal_entry, notifies the worker.
  const result = await decideCounterpartyCore(supabase, user.id, checked);
  if (!result.ok) return result;

  revalidatePath(`/${locale}/dashboard/inbox/counterparty`);
  revalidatePath(`/${locale}/dashboard/journal`);
  return result;
}
