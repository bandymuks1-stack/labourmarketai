import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyDeliveryFailure,
  nextRetryAt,
  type ClassifiedFailure,
} from "@/lib/email/delivery-failure";
import type { TransactionalSendResult } from "@/lib/email/transactional";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keeps WHY a send failed (owner P0 2026-11-13). Every invitation send site
 * calls this with the provider result it already has:
 *
 *   1. one log line per failure — invitation id, path, reason CODE, class,
 *      next retry. Never the address. This works even before migration
 *      20261113190000 is applied, so the next failure is diagnosable at once;
 *   2. `record_invitation_delivery_attempt_v1` — the attempt row plus the
 *      invitation's reason / class / next-retry / dead-letter columns.
 *
 * It never throws and never changes `delivery_status` (the existing mark
 * functions stay the only writers of that). A missing function (migration not
 * applied) is silent; any other bookkeeping error is logged, not raised — the
 * mail has already left or failed, and the caller's result must stay true.
 */

export type DeliveryAttemptPath = "intake" | "create" | "resend" | "reprocess" | "auto_retry";

export type RecordedAttempt =
  | { readonly outcome: "sent" }
  | ({ readonly outcome: "delivery_failed"; readonly nextRetryAt: Date | null } & ClassifiedFailure)
  | { readonly outcome: "not_attempted" };

type RpcClient = Pick<SupabaseClient, "rpc">;

export async function recordDeliveryAttempt(input: {
  readonly invitationId: string;
  readonly path: DeliveryAttemptPath;
  readonly result: TransactionalSendResult;
  /** Attempts made so far INCLUDING this one (1 for a first send). */
  readonly attempts: number;
  /** Only partner referrals are retried automatically (nobody else can press
   *  resend for them); every other path gets no scheduled retry. */
  readonly autoRetry: boolean;
  readonly now?: Date;
  readonly client?: RpcClient;
}): Promise<RecordedAttempt> {
  const recorded = decideAttempt(input);
  if (recorded.outcome === "not_attempted") return recorded;
  if (recorded.outcome === "delivery_failed") {
    console.error(
      "[invitations] delivery_failed",
      `id=${input.invitationId}`,
      `path=${input.path}`,
      `reason=${recorded.reason}`,
      `class=${recorded.failureClass}`,
      `attempt=${input.attempts}`,
      `next_retry=${recorded.nextRetryAt ? recorded.nextRetryAt.toISOString() : "none"}`,
    );
  }
  try {
    const client = input.client ?? (createAdminClient() as unknown as RpcClient);
    const { data, error } = await client.rpc("record_invitation_delivery_attempt_v1", {
      p_invitation_id: input.invitationId,
      p_path: input.path,
      p_outcome: recorded.outcome,
      p_reason: recorded.outcome === "delivery_failed" ? recorded.reason : null,
      p_failure_class: recorded.outcome === "delivery_failed" ? recorded.failureClass : null,
      p_next_retry_at:
        recorded.outcome === "delivery_failed" && recorded.nextRetryAt ? recorded.nextRetryAt.toISOString() : null,
    });
    const code = (error as { code?: string } | null)?.code;
    if (error && code !== "42883" && code !== "PGRST202") {
      console.error("[invitations] record_invitation_delivery_attempt_v1 failed:", input.invitationId, code ?? "unknown");
    } else if (!error && data !== "ok") {
      console.error("[invitations] record_invitation_delivery_attempt_v1 refused:", input.invitationId, String(data));
    }
  } catch {
    console.error("[invitations] record_invitation_delivery_attempt_v1 unavailable:", input.invitationId);
  }
  return recorded;
}

/** Pure: what one provider result means for the attempt record. */
export function decideAttempt(input: {
  readonly result: TransactionalSendResult;
  readonly attempts: number;
  readonly autoRetry: boolean;
  readonly now?: Date;
}): RecordedAttempt {
  const r = input.result;
  if (r.status === "sent") return { outcome: "sent" };
  if (r.status !== "failed") return { outcome: "not_attempted" };
  const classified = classifyDeliveryFailure(r.reason);
  const next = input.autoRetry
    ? nextRetryAt({ failureClass: classified.failureClass, attempts: input.attempts, now: input.now ?? new Date() })
    : null;
  return { outcome: "delivery_failed", ...classified, nextRetryAt: next };
}
