import "server-only";

/**
 * Supabase-backed {@link EmailSendStore}: calls the atomic, service-role-only
 * `reserve_email_send_v1` RPC (migration 20261006110000) through the
 * service-role client. Any failure (RPC absent, DB error, missing service env,
 * malformed answer) THROWS so the guard applies its documented fail policy.
 *
 * Plus the one entry point the send sites use: `guardedSendTransactionalEmail`
 * (reserve, then send) and `reserveEmailSend` (reserve only).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isTransactionalEmailConfigured,
  sendTransactionalEmail,
  type TransactionalEmail,
  type TransactionalSendResult,
} from "@/lib/email/transactional";
import {
  reserveDurableEmailSend,
  type EmailSendDecision,
  type EmailSendKind,
  type EmailSendReservation,
  type EmailSendStore,
  type EmailSendStoreResult,
} from "@/lib/email/durable-send-guard";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

export function createSupabaseEmailSendStore(
  getClient: () => RpcClient = () => createAdminClient() as unknown as RpcClient,
): EmailSendStore {
  return {
    async reserve(r: EmailSendReservation): Promise<EmailSendStoreResult> {
      const { data, error } = await getClient().rpc("reserve_email_send_v1", {
        p_organization_id: r.organizationId,
        p_recipient_profile_id: r.recipientProfileId,
        p_recipient_hash: r.recipientHash,
        p_kind: r.kind,
        p_max_per_org: r.limits.maxPerOrg,
        p_max_per_recipient: r.limits.maxPerRecipient,
        p_max_global: r.limits.maxGlobalNoOrg,
      });
      if (error) throw new Error(`reserve_email_send_v1 failed: ${error.code ?? "unknown"}`);
      const d = data as { allowed?: unknown; reason?: unknown; organization_id?: unknown } | null;
      if (!d || typeof d.allowed !== "boolean") throw new Error("reserve_email_send_v1 malformed");
      if (d.allowed) {
        return {
          allowed: true,
          organizationId: typeof d.organization_id === "string" ? d.organization_id : null,
        };
      }
      if (d.reason === "recipient_cap" || d.reason === "organization_cap" || d.reason === "global_cap") {
        return { allowed: false, reason: d.reason };
      }
      // invalid_* answers mean a programming error, not a cap: treat as unreadable.
      throw new Error(`reserve_email_send_v1 refused: ${String(d.reason)}`);
    },
  };
}

let store: EmailSendStore | null = null;
function defaultStore(): EmailSendStore {
  return (store ??= createSupabaseEmailSendStore());
}
/** Test seam. */
export function __setEmailSendStoreForTests(s: EmailSendStore | null): void {
  store = s;
}

/** Reserve one durable send slot. A no-op `allowed` when no REAL provider is
 *  configured (log/dev mode sends nothing, so there is nothing to bound). */
export async function reserveEmailSend(input: {
  recipientEmail: string;
  organizationId?: string | null;
  recipientProfileId?: string | null;
  kind: EmailSendKind;
}): Promise<EmailSendDecision> {
  if (!isTransactionalEmailConfigured()) return { allowed: true, degraded: false };
  return reserveDurableEmailSend(defaultStore(), input);
}

/** Reserve, then send. A refused send is reported as the truthful
 *  `failed / rate_limited` (callers already map non-`sent` to delivery_failed). */
export async function guardedSendTransactionalEmail(
  message: TransactionalEmail,
  ctx: {
    kind: EmailSendKind;
    organizationId?: string | null;
    recipientProfileId?: string | null;
  },
): Promise<TransactionalSendResult> {
  const decision = await reserveEmailSend({ recipientEmail: message.to, ...ctx });
  if (!decision.allowed) return { status: "failed", reason: "rate_limited" };
  return sendTransactionalEmail(message);
}
