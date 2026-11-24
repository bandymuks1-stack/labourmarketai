"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { CONTRACT_STATUSES, PROPOSAL_STATUSES } from "@/lib/commercial/commercial-model";

/**
 * Commercial CRM write actions (Wagon 10). Writes go only through the gated
 * owner-scoped SECURITY DEFINER RPCs (migration 20260718190000). Amounts are
 * EUR cents. No e-signature is produced — a contract holds only a document
 * reference + status.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type CommercialActionResult =
  | { ok: true }
  | { ok: false; code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error"; message?: string };

function mapError(error: { code?: string; message?: string }): CommercialActionResult {
  if (error.code === RPC_NOT_FOUND || error.code === UNDEFINED_COLUMN || error.code === RELATION_NOT_FOUND) {
    return { ok: false, code: "needs_migration" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || msg.includes("not authorized")) return { ok: false, code: "not_authorized" };
  if (msg.includes("required") || msg.includes("invalid")) return { ok: false, code: "invalid" };
  console.error("[commercial] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

async function withUser(): Promise<SupabaseClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function createProposalAction(input: {
  title: string;
  amountCents: number;
  customerRequestId?: string;
  projectId?: string;
}): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  const cents = Math.round(input.amountCents);
  if (!input.title.trim() || !Number.isFinite(cents) || cents < 0) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("create_proposal_v1", {
    p_title: input.title.trim().slice(0, 200),
    p_amount_cents: cents,
    p_customer_request_id: input.customerRequestId || null,
    p_project_id: input.projectId || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setProposalStatusAction(input: {
  proposalId: string;
  status: string;
  rejectionReason?: string;
}): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.proposalId || !(PROPOSAL_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, code: "invalid" };
  }
  const { error } = await asAny(supabase).rpc("set_proposal_status_v1", {
    p_proposal_id: input.proposalId,
    p_status: input.status,
    p_rejection_reason: (input.rejectionReason ?? "").trim().slice(0, 1000) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteProposalAction(input: { proposalId: string }): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.proposalId) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("delete_proposal_v1", { p_proposal_id: input.proposalId });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createContractAction(input: {
  title: string;
  valueCents: number;
  proposalId?: string;
  projectId?: string;
  parties?: string;
  signedDocumentRef?: string;
}): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  const cents = Math.round(input.valueCents);
  if (!input.title.trim() || !Number.isFinite(cents) || cents < 0) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("create_contract_v1", {
    p_title: input.title.trim().slice(0, 200),
    p_value_cents: cents,
    p_proposal_id: input.proposalId || null,
    p_project_id: input.projectId || null,
    p_parties: (input.parties ?? "").trim().slice(0, 500) || null,
    p_signed_document_ref: (input.signedDocumentRef ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setContractStatusAction(input: {
  contractId: string;
  status: string;
}): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.contractId || !(CONTRACT_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, code: "invalid" };
  }
  const { error } = await asAny(supabase).rpc("set_contract_status_v1", {
    p_contract_id: input.contractId,
    p_status: input.status,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteContractAction(input: { contractId: string }): Promise<CommercialActionResult> {
  const supabase = await withUser();
  if (!supabase) return { ok: false, code: "auth" };
  if (!input.contractId) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("delete_contract_v1", { p_contract_id: input.contractId });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
