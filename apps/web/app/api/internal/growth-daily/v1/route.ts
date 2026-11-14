import { NextResponse } from "next/server";

import { buildGrowthDaily, resolveGrowthDay } from "@/lib/api/growth-daily";
import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GROWTH DAILY — one UTC day of REAL registrations by first-touch attribution, plus ACTIVE Living CVs, for Agentai OS
 * (owner directive 2026-10-29: Agentai is measured by registrations and active Living CVs, not invitations sent).
 * Contract: docs/contracts/AGENTAI_GROWTH_DAILY_V1.md.
 *
 * AUTH: the same machine secret as the supply feed and the capability readback (`lib/api/supply-feed-auth.ts`),
 * constant-time compared. 503 while the secret is unset, 401 on a wrong token. No cookie or user path.
 *
 * QUERY: `?day=YYYY-MM-DD` (UTC, complete days only, default yesterday); anything else is 400.
 *
 * BODY: counts only (`lib/api/growth-daily.ts`), small cells rolled up before they leave. No row, name, id, e-mail or
 * timestamp of a person. A failed or inconsistent read is 503 with no counts, never a 200 with zeros.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth === "not_configured") return NextResponse.json({ ok: false, reason: auth }, { status: 503 });
  if (auth !== "ok") return NextResponse.json({ ok: false, reason: auth }, { status: 401 });

  const now = Date.now();
  const resolved = resolveGrowthDay(new URL(request.url).searchParams.get("day"), now);
  if (!resolved.ok) return NextResponse.json({ ok: false, reason: "invalid_day" }, { status: 400 });

  try {
    const { data, error } = await createAdminClient().rpc("agentai_daily_growth_aggregate_v1", { p_day: resolved.day });
    const body = error ? null : buildGrowthDaily(data, resolved.day, new Date(now).toISOString());
    if (body === null) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
    return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
