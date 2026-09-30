import "server-only";

import { createHash } from "node:crypto";

import type { ExecResult } from "@/lib/conversation/executor-contract";

import type { CapabilityCaller, CapabilityKind } from "./contract";

/**
 * THE AUDIT RECEIPT for a write an authorized assistant performed.
 *
 * Every confirm/execute call on /api/mcp leaves one row in the canonical
 * `audit_logs` table, written by `record_external_action_receipt_v1`
 * (SECURITY DEFINER; actor = auth.uid(), never a client value):
 *
 *   actor          the signed-in person the assistant acted for — also the
 *                  CONFIRMATION actor: the one-time token is bound to them
 *   context        the organization the caller was acting for (the durable
 *                  active-workspace pointer; null in the personal space) —
 *                  the database refuses an organization the caller is not in
 *   when           occurred_at (database clock)
 *   operation      the capability id (`project.create_confirm`, …)
 *   object         the primary id the write produced or touched
 *   channel        assistant_mcp (an assistant, not the person's own click)
 *   confirmation   the first 16 hex of sha256(token) — a reference that ties
 *                  the receipt to the exact draft, never the token itself
 *   outcome        ok | the refusal code
 *   read-back      whether the capability returned the canonical row
 *
 * The domain row itself (the project, the assignment, the shortlist decision)
 * stays the canonical record of WHAT changed; this is the record of WHO did
 * it THROUGH WHICH DOOR on WHICH confirmation.
 *
 * Honest degradation: until the RPC is applied the receipt is
 * `not_enabled`; a failed receipt is `failed`. The write is never undone and
 * never reported as failed because its receipt could not be written — and the
 * client is told exactly which of the two happened.
 */

export type ReceiptState =
  | { state: "recorded"; id: string }
  | { state: "not_enabled" }
  | { state: "failed" }
  | { state: "not_applicable" };

const UNDEFINED_FN = new Set(["42883", "PGRST202"]);

/** Keys whose value names the object a write produced or touched, in the
 *  order a receipt prefers them. */
const OBJECT_KEYS = ["entryId", "projectId", "requestId", "assignmentId", "sessionId", "id"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pickObjectId(args: Record<string, unknown>, data: Record<string, unknown> | undefined): string | null {
  for (const source of [data, (data?.readBack as Record<string, unknown> | undefined) ?? undefined, args]) {
    if (!source) continue;
    for (const k of OBJECT_KEYS) {
      const v = source[k];
      if (typeof v === "string" && UUID.test(v)) return v;
    }
  }
  return null;
}

export function confirmationRef(token: unknown): string | null {
  if (typeof token !== "string" || token.length === 0) return null;
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export async function recordExternalReceipt(
  caller: CapabilityCaller,
  capability: { id: string; kind: CapabilityKind },
  rawArgs: unknown,
  result: ExecResult,
): Promise<ReceiptState> {
  if (capability.kind !== "confirm" && capability.kind !== "execute") return { state: "not_applicable" };
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Record<string, unknown>;
  const data = result.ok ? ((result.data ?? undefined) as Record<string, unknown> | undefined) : undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = caller.supabase as any;
    // The context the employer gate itself reads: the durable active-workspace
    // pointer. Null = personal space. The RPC re-checks membership.
    const { data: profile } = await sb
      .from("profiles")
      .select("active_organization_id")
      .eq("id", caller.userId)
      .maybeSingle();
    const organizationId =
      typeof profile?.active_organization_id === "string" && UUID.test(profile.active_organization_id)
        ? (profile.active_organization_id as string)
        : null;
    const outcome = result.ok ? "ok" : ((result as { code?: string }).code ?? "error");
    const { data: id, error } = await sb.rpc("record_external_action_receipt_v1", {
      p_capability: capability.id,
      p_organization_id: organizationId,
      p_entity_id: pickObjectId(args, data),
      p_confirmation_ref: confirmationRef(args.confirmationToken),
      p_outcome: /^[a-z_]{1,40}$/.test(outcome) ? outcome : "error",
      p_readback_ok: result.ok ? data?.readBack !== undefined && data?.readBack !== null : null,
    });
    if (error) return UNDEFINED_FN.has(error.code ?? "") ? { state: "not_enabled" } : { state: "failed" };
    return typeof id === "string" ? { state: "recorded", id } : { state: "failed" };
  } catch {
    return { state: "failed" };
  }
}
