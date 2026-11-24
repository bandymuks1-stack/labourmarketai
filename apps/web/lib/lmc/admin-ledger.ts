import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LMC_FLAG_POLICY, type LmcFlagPolicyClass } from "@/lib/billing/lmc-flags";

/**
 * LMC ledger — ADMIN read layer + the one admin write caller (commercial
 * safe-prep v1; harvested from draft PR #893 and reimplemented against
 * current main).
 *
 * Complements lib/lmc/lmc-account.ts (the user's OWN balance read) with the
 * admin view: the DB kill-switch states (not the TS mirror — the mirror says
 * what the code ships, `lmc_settings` says what production holds), the
 * outstanding credit liability (every issued LMC is a euro of deferred
 * revenue; audit F14: nothing measured it), and the credit-a-tester grant.
 *
 * Hard boundaries:
 *   - NO new table, NO new RPC, NO new ledger concept. The only write goes
 *     through `lmc_admin_grant_v1`, which self-gates on auth.uid() +
 *     public.is_admin() + the `lmc_promotional_grants_enabled` kill-switch +
 *     a per-grant cap + a mandatory expiry — and refuses everything while the
 *     switch is off (it is off; flipping it is owner-channel).
 *   - Reads and the grant use the CALLER's session — RLS and the RPC's own
 *     is_admin() check decide, never the service role.
 *   - Flags are READ-ONLY here. `lmc_set_flag_v1` is service_role-only.
 *   - A failed read is reported as null (unavailable), never as zeros that
 *     look like facts (#1314 defect class).
 */

/** 1 LMC = 100 LMC-cents (the ledger stores bigint cents; 1 LMC = 1 EUR of internal credit). */
export const LMC_CENTS_PER_UNIT = 100;

/** The ledger's own per-grant ceiling (foundation migration: v_cap = 100000 cents). */
export const LMC_ADMIN_GRANT_MAX_CENTS = 100_000;

/** The ledger's mandatory expiry window ceiling for an admin grant. */
export const LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS = 365;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export function lmcCentsToUnits(cents: number): string {
  return (cents / LMC_CENTS_PER_UNIT).toFixed(2);
}

export interface LmcFlagState {
  readonly key: string;
  readonly enabled: boolean;
  readonly policy: LmcFlagPolicyClass;
}

/**
 * Kill-switch state as the DATABASE sees it (admin-only by RLS).
 * `null` when the caller may not read it or the ledger is absent — an unknown
 * flag is never reported as enabled, and an unreadable one never as a fact.
 */
export async function getLmcFlags(): Promise<LmcFlagState[] | null> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("lmc_settings")
    .select("key, enabled")
    .order("key");
  if (error || !data) return null;
  const rows = data as { key: string; enabled: unknown }[];
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    key: r.key,
    enabled: r.enabled === true,
    // Fail-closed policy lookup: an unknown key reads system_locked, never admin.
    policy:
      (LMC_FLAG_POLICY as Record<string, LmcFlagPolicyClass>)[r.key] ??
      "system_locked",
  }));
}

export interface LmcLiabilitySummary {
  readonly accounts: number;
  readonly outstandingCents: number;
  readonly promotionalCents: number;
  readonly purchasedCents: number;
  readonly expiredRemainderCents: number;
}

/**
 * Outstanding LMC liability (admin read; RLS lets an admin see all accounts).
 * A live read of the canonical `lmc_account_balances` view — the same
 * arithmetic `lmc_spend_v1` enforces — never a stored report.
 */
export async function getLmcLiabilitySummary(): Promise<LmcLiabilitySummary | null> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("lmc_account_balances")
    .select(
      "account_id, available_cents, promotional_available_cents, purchased_available_cents, expired_remainder_cents",
    );
  if (error || !data) return null;
  const rows = data as Record<string, unknown>[];
  const sum = (k: string) => rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
  return {
    accounts: rows.length,
    outstandingCents: sum("available_cents"),
    promotionalCents: sum("promotional_available_cents"),
    purchasedCents: sum("purchased_available_cents"),
    expiredRemainderCents: sum("expired_remainder_cents"),
  };
}

export type LmcGrantOutcome =
  | { ok: true; replay: boolean; amountCents: number }
  | {
      ok: false;
      /** Canonical ledger reason, safe to show to an admin. */
      reason:
        | "grants_disabled"
        | "not_admin"
        | "recipient_not_found"
        | "invalid_amount"
        | "invalid_expiry"
        | "idempotency_conflict"
        | "ledger_absent"
        | "error";
      detail?: string;
    };

/** Map the ledger's canonical error text onto a stable, honest reason code. */
export function mapLmcGrantError(message: string): LmcGrantOutcome & { ok: false } {
  const m = message.toLowerCase();
  if (m.includes("lmc_promotional_grants_disabled")) {
    return { ok: false, reason: "grants_disabled" };
  }
  if (m.includes("admin only") || m.includes("not authenticated") || m.includes("lmc_actor_not_authorized")) {
    return { ok: false, reason: "not_admin" };
  }
  if (
    m.includes("lmc_recipient_not_found_or_unverified") ||
    m.includes("lmc_recipient_has_no_profile") ||
    m.includes("lmc_unknown_profile")
  ) {
    return { ok: false, reason: "recipient_not_found" };
  }
  if (m.includes("lmc_invalid_amount")) return { ok: false, reason: "invalid_amount" };
  if (m.includes("lmc_invalid_expiry")) return { ok: false, reason: "invalid_expiry" };
  if (m.includes("lmc_idempotency_conflict")) {
    return { ok: false, reason: "idempotency_conflict" };
  }
  if (m.includes("does not exist") || m.includes("undefined function")) {
    return { ok: false, reason: "ledger_absent" };
  }
  return { ok: false, reason: "error", detail: message.slice(0, 200) };
}

export interface AdminGrantInput {
  readonly recipientEmail: string;
  readonly amountCents: number;
  readonly reason: string;
  readonly campaign: string;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
}

/**
 * Credit LMC to a verified recipient through the existing ledger RPC. Called
 * with the ADMIN'S OWN session: `lmc_admin_grant_v1` is granted to
 * `authenticated` and re-checks public.is_admin() itself, so no service-role
 * key touches this path. While `lmc_promotional_grants_enabled` is false (it
 * is), the ledger refuses the write and that refusal is shown verbatim as
 * `grants_disabled` — never a credit that did not happen.
 */
export async function adminGrantLmc(input: AdminGrantInput): Promise<LmcGrantOutcome> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("lmc_admin_grant_v1", {
    p_recipient_email: input.recipientEmail,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
    p_campaign: input.campaign,
    p_expires_at: input.expiresAt,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return mapLmcGrantError(error.message ?? "error");
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    // The ledger reports an idempotent retry as already_processed = true.
    replay: payload.already_processed === true,
    amountCents: Number(payload.amount_cents ?? input.amountCents),
  };
}
