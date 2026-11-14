import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import { readRecentDeliveryReports } from "@/lib/email/bounce-reader";
import { guardedSendTransactionalEmail } from "@/lib/email/send-ledger-store";
import { isTransactionalEmailConfigured } from "@/lib/email/transactional";
import { activeLocales } from "@/lib/i18n/config";
import { recordDeliveryAttempt } from "@/lib/invitations/delivery-attempts";
import {
  deliveryAlerts,
  retryDueDeliveries,
  type DeliveryAlert,
  type DeliveryHealth,
  type RetryCandidate,
  type RetryReport,
} from "@/lib/invitations/delivery-retry";
import { buildInvitationBody, buildInvitationSubject } from "@/lib/invitations/email-content";
import { buildInviteLink } from "@/lib/invitations/model";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The server wiring of `delivery-retry.ts` (owner P0 2026-11-13): the service-role reads and
 * writes — invitation_delivery_retry_candidates_v1, reissue_external_referral_v1,
 * mark_external_referral_delivery_v1, record_invitation_delivery_attempt_v1,
 * dead_letter_invitation_delivery_v1, invitation_delivery_health_v1 — and the ledgered provider
 * path. Every decision lives in the pure module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type DeliveryRetryRunResult =
  | { readonly kind: "needs_migration" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "retry";
      readonly report: RetryReport;
      readonly health: DeliveryHealth | null;
      readonly alerts: readonly DeliveryAlert[];
    };

/** Health snapshot (`invitation_delivery_health_v1`), or null when unreadable. */
export async function readInvitationDeliveryHealth(admin: SupabaseClient, hours = 24): Promise<DeliveryHealth | null> {
  const { data, error } = await asAny(admin).rpc("invitation_delivery_health_v1", { p_hours: hours });
  if (error || !data || typeof data !== "object") return null;
  return data as DeliveryHealth;
}

/**
 * The scheduled retry of TEMPORARY delivery failures (lib/invitations/delivery-retry.ts holds
 * every rule). `healthOnly` reads the counters and alerts and sends nothing.
 */
export async function runInvitationDeliveryRetry(input: {
  readonly origin: string;
  readonly healthOnly?: boolean;
}): Promise<DeliveryRetryRunResult> {
  const admin = createAdminClient();
  let candidates: RetryCandidate[] = [];
  if (!input.healthOnly) {
    const { data, error } = await asAny(admin).rpc("invitation_delivery_retry_candidates_v1");
    if (error) {
      return error.code === "42883" || error.code === "PGRST202"
        ? { kind: "needs_migration" }
        : { kind: "unavailable" };
    }
    candidates = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => typeof r.invited_email === "string")
      .map((r) => ({
        id: String(r.id),
        invitedEmail: r.invited_email as string,
        locale: (r.locale as string | null) ?? null,
        attempts: Number(r.delivery_attempts ?? 1) || 1,
      }));
  }
  const report: RetryReport = input.healthOnly
    ? {
        outcome: "nothing_due",
        due: 0,
        attempted: 0,
        sent: 0,
        failed: { TEMPORARY: 0, PERMANENT: 0, CONFIGURATION: 0, UNKNOWN_OUTCOME: 0 },
        deadLettered: 0,
        refused: {},
        stoppedBy: null,
      }
    : await retryDueDeliveries(candidates, {
        emailConfigured: isTransactionalEmailConfigured,
        mintToken: () => {
          const token = randomBytes(32).toString("base64url");
          return { token, hash: createHash("sha256").update(token).digest("hex") };
        },
        reissue: async (id, hash) => {
          const r = await asAny(admin).rpc("reissue_external_referral_v1", {
            p_invitation_id: id,
            p_new_token_hash: hash,
          });
          return r.error ? "error" : String(r.data ?? "error");
        },
        buildLink: (locale, token) => buildInviteLink(input.origin, locale, token),
        send: async (to, locale, link) => {
          const t = await getTranslations({ locale, namespace: "invitations.email" });
          return guardedSendTransactionalEmail(
            {
              to,
              subject: buildInvitationSubject(t, "join_platform"),
              text: buildInvitationBody(t, { link, personalMessage: null }),
            },
            { kind: "invitation", requireLedger: true },
          );
        },
        mark: async (id, outcome) => {
          const r = await asAny(admin).rpc("mark_external_referral_delivery_v1", {
            p_invitation_id: id,
            p_outcome: outcome,
          });
          if (r.error || r.data !== "ok") throw new Error("mark_failed");
        },
        record: async (id, result, attempts) => {
          const rec = await recordDeliveryAttempt({
            invitationId: id,
            path: "auto_retry",
            result,
            attempts,
            autoRetry: true,
            client: admin,
          });
          return rec.outcome === "delivery_failed" ? rec.failureClass : null;
        },
        deadLetter: async (id, reason) => {
          await asAny(admin).rpc("dead_letter_invitation_delivery_v1", {
            p_invitation_id: id,
            p_reason: reason,
          });
        },
        resolveLocale: (l) => ((activeLocales as readonly string[]).includes(l ?? "") ? (l as string) : "en"),
      });
  const health = await readInvitationDeliveryHealth(admin, 24);
  return { kind: "retry", report, health, alerts: health ? deliveryAlerts(health) : [] };
}

export type BounceRunResult =
  | { readonly kind: "not_configured" }
  | { readonly kind: "failed"; readonly reason: string }
  | {
      readonly kind: "bounces";
      readonly scanned: number;
      readonly reports: number;
      readonly outcomes: Readonly<Record<string, number>>;
    };

/**
 * BOUNCE RECONCILIATION (owner correction 2026-11-13 item 6): read recent delivery reports from
 * the sender mailbox (read-only) and mark OUR messages by Message-ID — 'failed' → BOUNCED (and no
 * further automatic retry), 'delivered' → DELIVERED_CONFIRMED. Idempotent; sends nothing.
 */
export async function runBounceReconciliation(): Promise<BounceRunResult> {
  const read = await readRecentDeliveryReports();
  if (read.status === "not_configured") return { kind: "not_configured" };
  if (read.status === "failed") return { kind: "failed", reason: read.reason };
  const admin = createAdminClient();
  const outcomes: Record<string, number> = {};
  for (const f of read.facts) {
    const r = await asAny(admin).rpc("record_invitation_dsn_v1", {
      p_message_id: f.messageId,
      p_action: f.action,
      p_status: f.status,
    });
    const key = r.error ? (r.error.code === "PGRST202" || r.error.code === "42883" ? "needs_migration" : "error") : String(r.data ?? "error");
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  return { kind: "bounces", scanned: read.scanned, reports: read.facts.length, outcomes };
}
