import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/api/cron-auth";
import { dispatchQueuedHandoffs } from "@/lib/commercial/handoff-dispatch";

/**
 * COMMERCIAL HANDOFF DISPATCH — hands queued `commercial_handoffs` rows to
 * Nonstop's receiving door (docs/integrations/NONSTOP_COMMERCIAL_HANDOFF_V1.md).
 *
 * AUTH: `authorizeCronRequest` — the CRON_SECRET machine check; while it is
 * unset the route refuses 401 unconditionally. INERT a second time while
 * NONSTOP_HANDOFF_ENDPOINT / NONSTOP_HANDOFF_TOKEN are unset: it answers
 * `not_configured`, calls nothing and changes nothing. Both gates are the
 * owner's. Responses carry counts only — no ids, no people, no employers.
 *
 * Scheduled daily (apps/web/vercel.json) — the project is on the Vercel
 * Hobby plan, whose crons fire at most once a day — as the RETRY SWEEP; the
 * interest write path dispatches a fresh handoff immediately through the
 * same function. The door exists since 2026-09-17 (Nonstop 25b49fc).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCronRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }
  const result = await dispatchQueuedHandoffs();
  if (result.kind === "not_configured") {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }
  if (result.kind === "unavailable") {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result });
}
