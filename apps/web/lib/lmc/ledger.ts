import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LMC_FLAG_POLICY, type LmcFlagPolicyClass } from "@/lib/billing/lmc-flags";

/**
 * LMC ledger — application seam (commercial readiness audit v1).
 *
 * The immutable LMC ledger (10 tables, 18 SECURITY DEFINER RPCs, migration
 * 20260720190000) has been live in production since 2026-07-21 with ZERO
 * application code calling it: a complete financial engine with no product on
 * top, so there was no way to credit a tester and no way for anyone to see a
 * balance. This module is that missing seam and NOTHING more.
 *
 * Hard boundaries (unchanged by this module):
 *   - it creates NO table, NO RPC and NO new ledger concept — every write goes
 *     through `lmc_admin_grant_v1`, which self-gates on auth.uid() +
 *     public.is_admin() + the `lmc_promotional_grants_enabled` kill-switch +
 *     a 1000-LMC per-grant cap + a mandatory ≤365-day expiry;
 *   - reads use the CALLER's session (RLS: own account, or all for an admin) —
 *     never the service role;
 *   - flags are read-only here. Flipping one stays owner-only through
 *     `lmc_set_flag_v1`, which is granted to service_role alone.
 *
 * LMC is internal platform credit (1 LMC = 1 EUR of credit). It is not
 * withdrawable, not an investment and not an electronic-money claim — see
 * lib/billing/lmc-flags.ts.
 */

/** 1 LMC = 100 LMC-cents (the ledger stores bigint cents). */
export const LMC_CENTS_PER_UNIT = 100;

/** The ledger's own per-grant ceiling (migration: v_cap = 100000 cents). */
export const LMC_ADMIN_GRANT_MAX_CENTS = 100_000;

/** The ledger's mandatory expiry window ceiling for an admin grant. */
export const LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS = 365;

const RELATION_ABSENT = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface LmcFlagState {
  readonly key: string;
  readonly enabled: boolean;
  readonly policy: LmcFlagPolicyClass;
}

export interface LmcBalance {
  readonly availableCents: number;
  readonly promotionalCents: number;
  readonly purchasedCents: number;
  readonly expiredRemainderCents: number;
}

export const EMPTY_BALANCE: LmcBalance = {
  availableCents: 0,
  promotionalCents: 0,
  purchasedCents: 0,
  expiredRemainderCents: 0,
};

export function lmcCentsToUnits(cents: number): string {
  return (cents / LMC_CENTS_PER_UNIT).toFixed(2);
}

/**
 * Kill-switch state as the DATABASE sees it (admin-only by RLS).
 * `null` when the caller may not read it or the ledger is absent — an unknown
 * flag is never reported as enabled.
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
    policy:
      (LMC_FLAG_POLICY as Record<string, LmcFlagPolicyClass>)[r.key] ??
      "system_locked",
  }));
}

/** The signed-in user's own spendable balance (RLS-scoped). */
export async function getMyLmcBalance(): Promise<LmcBalance | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await asAny(supabase)
    .from("lmc_account_balances")
    .select(
      "available_cents, promotional_available_cents, purchased_available_cents, expired_remainder_cents",
    )
    .eq("profile_id", user.id)
    .maybeSingle();
  // No account yet is not an error — nobody has credited this user.
  if (error) {
    if (error.code === RELATION_ABSENT) return null;
    return null;
  }
  if (!data) return EMPTY_BALANCE;
  return {
    availableCents: Number(data.available_cents ?? 0),
    promotionalCents: Number(data.promotional_available_cents ?? 0),
    purchasedCents: Number(data.purchased_available_cents ?? 0),
    expiredRemainderCents: Number(data.expired_remainder_cents ?? 0),
  };
}

export interface LmcLiabilitySummary {
  readonly accounts: number;
  readonly outstandingCents: number;
  readonly promotionalCents: number;
  readonly purchasedCents: number;
  readonly expiredRemainderCents: number;
}

/**
 * Outstanding LMC liability (admin read). Every issued LMC is a euro of
 * deferred revenue: audit finding F14 was that nothing anywhere measured it.
 * This is a live read of `lmc_account_balances`, not a stored report.
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
  const sum = (k: string) =>
    rows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);
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
export function mapLmcError(message: string): LmcGrantOutcome & { ok: false } {
  const m = message.toLowerCase();
  if (m.includes("lmc_promotional_grants_disabled")) {
    return { ok: false, reason: "grants_disabled" };
  }
  if (m.includes("admin only") || m.includes("not authenticated")) {
    return { ok: false, reason: "not_admin" };
  }
  if (m.includes("lmc_recipient_not_found_or_unverified") || m.includes("lmc_recipient_has_no_profile")) {
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
 * Credit LMC to a verified recipient through the existing ledger RPC.
 * Called with the ADMIN'S OWN session: the RPC reads auth.uid() and re-checks
 * public.is_admin() itself, so no service-role key ever touches this path.
 */
export async function adminGrantLmc(
  input: AdminGrantInput,
): Promise<LmcGrantOutcome> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("lmc_admin_grant_v1", {
    p_recipient_email: input.recipientEmail,
    p_amount_cents: input.amountCents,
    p_reason: input.reason,
    p_campaign: input.campaign,
    p_expires_at: input.expiresAt,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return mapLmcError(error.message ?? "error");
  const payload = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    // The ledger reports an idempotent retry as already_processed = true.
    replay: payload.already_processed === true,
    amountCents: Number(payload.amount_cents ?? input.amountCents),
  };
}
