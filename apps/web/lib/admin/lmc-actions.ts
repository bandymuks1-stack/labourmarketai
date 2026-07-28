"use server";

import "server-only";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { isSuperadmin } from "@/lib/auth/superadmin";
import {
  adminGrantLmc,
  LMC_ADMIN_GRANT_MAX_CENTS,
  LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS,
  LMC_CENTS_PER_UNIT,
  type LmcGrantOutcome,
} from "@/lib/lmc/ledger";

/**
 * Admin LMC credit action (commercial readiness audit v1).
 *
 * The single application entry point for "credit LMC to a tester". It adds no
 * ledger logic of its own: the database RPC re-checks the admin identity, the
 * `lmc_promotional_grants_enabled` kill-switch, the per-grant cap and the
 * mandatory expiry, and refuses everything while the switch is off. This action
 * only validates input shape and forwards it with the admin's own session.
 *
 * The idempotency key is caller-supplied on purpose: retrying a grant with the
 * same key returns the ORIGINAL transaction instead of crediting twice.
 */

const Schema = z.object({
  locale: z.string().min(2).max(5),
  recipientEmail: z.string().email(),
  /** Whole LMC (1 LMC = 1 EUR of internal credit). */
  amountLmc: z.number().positive().max(LMC_ADMIN_GRANT_MAX_CENTS / LMC_CENTS_PER_UNIT),
  reason: z.string().min(3).max(200),
  campaign: z.string().min(2).max(80),
  expiryDays: z.number().int().positive().max(LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS),
  idempotencyKey: z.string().min(8).max(120),
});

export type AdminLmcGrantInput = z.input<typeof Schema>;

export async function adminGrantLmcAction(
  input: AdminLmcGrantInput,
): Promise<LmcGrantOutcome> {
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_amount", detail: "invalid_input" };
  }
  // Belt-and-braces: the RPC gates on public.is_admin() itself, but an
  // unauthorized caller should never reach the ledger at all.
  if (!(await isSuperadmin())) return { ok: false, reason: "not_admin" };

  const v = parsed.data;
  const expiresAt = new Date(
    Date.now() + v.expiryDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await adminGrantLmc({
    recipientEmail: v.recipientEmail.trim(),
    amountCents: Math.round(v.amountLmc * LMC_CENTS_PER_UNIT),
    reason: v.reason.trim(),
    campaign: v.campaign.trim(),
    expiresAt,
    idempotencyKey: v.idempotencyKey.trim(),
  });

  if (result.ok) revalidatePath(`/${v.locale}/dashboard/admin/billing`);
  return result;
}
