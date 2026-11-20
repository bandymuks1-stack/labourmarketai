import { NextResponse } from "next/server";

import {
  LMC_PURCHASES_ENABLED,
  STRIPE_LMC_TOPUPS_ENABLED,
} from "@/lib/billing/lmc-flags";
import { getBillingConfig } from "@/lib/billing/config";
import { constructTestModeTopupWebhookEvent } from "@/lib/billing/provider";
import { handleLmcTopupEvent } from "@/lib/lmc/topup-settlement";

/**
 * LMC TOP-UP WEBHOOK — Stripe TEST only (LMC train Wagon 4). A SEPARATE
 * Stripe endpoint with its own TEST signing secret (lib/billing/config.ts),
 * so the subscription webhook (/api/billing/webhook) stays LMC-free.
 *
 *   1. BOTH kill-switches first → 503 before the body is read or anything is
 *      verified (Stripe retries; nothing can be lost while they are off);
 *   2. the adapter must be `stripe_test` → else 503;
 *   3. signature verified with the endpoint's TEST secret → else 400;
 *   4. a live-mode event → 400, never processed;
 *   5. settlement (lib/lmc/topup-settlement.ts) credits at most once per
 *      payment intent; replays answer 200 `already_credited`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!STRIPE_LMC_TOPUPS_ENABLED || !LMC_PURCHASES_ENABLED) {
    return NextResponse.json({ ok: false, reason: "topups_disabled" }, { status: 503 });
  }
  if (getBillingConfig().state !== "stripe_test") {
    return NextResponse.json({ ok: false, reason: "test_mode_required" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text(); // RAW body — required for signature verification
  let event;
  try {
    event = await constructTestModeTopupWebhookEvent(body, signature);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 400 });
  }
  if (!event.testMode) {
    return NextResponse.json({ ok: false, reason: "live_event_rejected" }, { status: 400 });
  }

  const outcome = await handleLmcTopupEvent(event);
  switch (outcome.kind) {
    case "credited":
    case "already_credited":
    case "ignored":
    case "not_paid":
      return NextResponse.json({ ok: true, received: true, result: outcome.kind });
    case "refund_pending_owner_decision":
      // Loud, never silent: the credit stays until the owner decides the
      // refund rule (MDD-08). Ids only — no amounts, no personal data.
      console.error(
        `[lmc-topup] refund_pending_owner_decision event=${event.id} payment_intent=${outcome.paymentIntentId}`,
      );
      return NextResponse.json({ ok: true, received: true, result: outcome.kind });
    case "refused":
      console.error(`[lmc-topup] refused event=${event.id} reason=${outcome.reason}`);
      return NextResponse.json(
        { ok: false, received: true, result: "refused", reason: outcome.reason },
        { status: outcome.reason === "live_event" ? 400 : 422 },
      );
    case "disabled":
      return NextResponse.json(
        { ok: false, received: true, result: "disabled", layer: outcome.layer },
        { status: 503 },
      );
    case "retry":
      return NextResponse.json(
        { ok: false, received: true, result: "retry" },
        { status: 500 },
      );
  }
}
