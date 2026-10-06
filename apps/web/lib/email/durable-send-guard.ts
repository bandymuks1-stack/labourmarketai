/**
 * DURABLE outbound-email guardrail (trial-readiness cost control).
 *
 * Owner decision: 500 emails / rolling 24h per ORGANIZATION, plus 5 emails /
 * recipient / 24h anti-runaway — surviving process restart, container restart
 * and multiple instances. The counting + recording is ONE atomic database call
 * (`reserve_email_send_v1`, migration 20261006110000: advisory locks, count,
 * insert in a single transaction), so concurrent instances cannot
 * over-subscribe a cap.
 *
 * This module is the PURE half: hashing, env limits, the store contract and
 * the fail policy. The Supabase-backed store lives in `send-ledger-store.ts`
 * (server-only); tests inject a fake store.
 *
 * PRIVACY: the recipient address is hashed here (sha256 of a domain-prefixed,
 * optionally salted, lowercased address) before it leaves the process; the
 * ledger never sees a raw address.
 *
 * RESERVE-BEFORE-SEND: a granted slot is consumed even if the provider then
 * fails — conservative on purpose (a retry loop against a failing provider is
 * the runaway this exists to stop).
 *
 * FAIL POLICY (documented, owner-aligned with the metering stance):
 *   if the durable store cannot be read (RPC absent because the migration is
 *   not applied, DB/network error, missing service env) the guard FAILS OPEN
 *   with a loud, greppable warning (`EMAIL_SEND_GUARD_DEGRADED`) — a
 *   notification or invitation email is never lost to a guard outage — but it
 *   is NOT unguarded: the legacy per-instance in-memory ceiling
 *   (`email-send-guard.ts`) is applied as a backstop for that send.
 */
import { createHash } from "node:crypto";

import { reserveEmailSendSlot } from "@/lib/notifications/email-send-guard";

export const DEFAULT_MAX_PER_ORG_DAY = 500;
export const DEFAULT_MAX_PER_RECIPIENT_DAY = 5;
/** Ceiling for sends that resolve to NO organization (24h, durable). */
export const DEFAULT_MAX_GLOBAL_NO_ORG_DAY = 2000;

/** Greppable marker: the durable store was unreadable, guard degraded. */
export const EMAIL_SEND_GUARD_DEGRADED = "[email/send-guard] DEGRADED (fail-open)";

export type EmailSendKind = "notification" | "invitation" | "transactional";

export type EmailSendLimits = {
  readonly maxPerOrg: number;
  readonly maxPerRecipient: number;
  readonly maxGlobalNoOrg: number;
};

export type EmailSendReservation = {
  readonly organizationId: string | null;
  readonly recipientProfileId: string | null;
  /** 64-hex hash — NEVER the address. */
  readonly recipientHash: string;
  readonly kind: EmailSendKind;
  readonly limits: EmailSendLimits;
};

export type EmailSendStoreResult =
  | { readonly allowed: true; readonly organizationId: string | null }
  | {
      readonly allowed: false;
      readonly reason: "recipient_cap" | "organization_cap" | "global_cap";
    };

/** The atomic check-and-record contract. MUST throw when the store is
 *  unreadable (never return a guessed allow/deny). */
export interface EmailSendStore {
  reserve(r: EmailSendReservation): Promise<EmailSendStoreResult>;
}

export type EmailSendDecision =
  | { readonly allowed: true; readonly degraded: boolean }
  | {
      readonly allowed: false;
      readonly reason: "recipient_cap" | "organization_cap" | "global_cap" | "degraded_backstop";
    };

function envInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1_000_000, Math.max(0, Math.floor(n))) : fallback;
}

export function emailSendLimitsFromEnv(
  env: Record<string, string | undefined> = process.env,
): EmailSendLimits {
  return {
    maxPerOrg: envInt(env.NOTIFICATION_EMAIL_MAX_PER_ORG_DAY, DEFAULT_MAX_PER_ORG_DAY),
    maxPerRecipient: envInt(
      env.NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY,
      DEFAULT_MAX_PER_RECIPIENT_DAY,
    ),
    maxGlobalNoOrg: envInt(
      env.NOTIFICATION_EMAIL_MAX_GLOBAL_DAY,
      DEFAULT_MAX_GLOBAL_NO_ORG_DAY,
    ),
  };
}

/** Stable, non-reversible-in-practice key for the ledger. Optional salt
 *  (EMAIL_SEND_LEDGER_SALT) hardens it against dictionary lookup. */
export function hashRecipient(
  email: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const salt = (env.EMAIL_SEND_LEDGER_SALT ?? "").trim();
  return createHash("sha256")
    .update(`email-send-ledger-v1:${salt}:${email.trim().toLowerCase()}`)
    .digest("hex");
}

export async function reserveDurableEmailSend(
  store: EmailSendStore,
  input: {
    readonly recipientEmail: string;
    readonly organizationId?: string | null;
    readonly recipientProfileId?: string | null;
    readonly kind: EmailSendKind;
  },
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Promise<EmailSendDecision> {
  const recipientHash = hashRecipient(input.recipientEmail, env);
  try {
    const res = await store.reserve({
      organizationId: input.organizationId ?? null,
      recipientProfileId: input.recipientProfileId ?? null,
      recipientHash,
      kind: input.kind,
      limits: emailSendLimitsFromEnv(env),
    });
    return res.allowed ? { allowed: true, degraded: false } : { allowed: false, reason: res.reason };
  } catch {
    // Store unreadable: fail OPEN, loudly, behind the per-instance backstop.
    // Never log the address; the hash prefix is enough to correlate.
    console.warn(EMAIL_SEND_GUARD_DEGRADED, {
      kind: input.kind,
      recipient: recipientHash.slice(0, 8),
    });
    const ok = reserveEmailSendSlot(recipientHash, now, {
      NOTIFICATION_EMAIL_MAX_PER_RUN_WINDOW: env.NOTIFICATION_EMAIL_MAX_PER_RUN_WINDOW,
      NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY: env.NOTIFICATION_EMAIL_MAX_PER_RECIPIENT_DAY,
    });
    return ok
      ? { allowed: true, degraded: true }
      : { allowed: false, reason: "degraded_backstop" };
  }
}
