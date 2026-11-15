import { NextResponse } from "next/server";

import { buildRegistrationsDaily, resolveRegistrationsDay } from "@/lib/api/registrations-daily";
import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * REGISTRATIONS DAILY — NEW and ACTIVE counts for five platform groups, for Agentai OS (owner decision 2026-11-14).
 * Contract: docs/contracts/LM_REGISTRATIONS_DAILY_V1.md (`lm-registrations-daily/v1`).
 *
 * AUTH: the same machine secret and check as the supply feed and capability readback (`lib/api/supply-feed-auth.ts`),
 * constant-time compared. 503 while the secret is unset (fail-closed), 401 on a missing or wrong token. No cookie or
 * user path.
 *
 * BODY: REAL-population counts only (`lib/api/registrations-daily.ts`), 1–2 withheld. No row, id, name, e-mail or
 * per-person timestamp. Read through `lm_registrations_daily_v1` (definer rights, EXECUTE for service_role only — the
 * service role is not granted SELECT on auth.users / profiles / organizations). Until that owner-gated function is
 * applied, and on any failed or malformed read, the answer is 503 — never a 200 with zeros.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function refuse(status: number, reason: string): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth === "not_configured") return refuse(503, auth);
  if (auth !== "ok") return refuse(401, auth);

  const nowMs = Date.now();
  const resolved = resolveRegistrationsDay(new URL(request.url).searchParams.get("day"), nowMs);
  if (!resolved.ok) return refuse(400, "invalid_day");

  try {
    const { data, error } = await createAdminClient().rpc("lm_registrations_daily_v1", { p_day: resolved.day });
    const body = error ? null : buildRegistrationsDaily(data, resolved.day, nowMs);
    if (body === null) return refuse(503, "unavailable");
    return NextResponse.json(body, { status: 200, headers: NO_STORE });
  } catch {
    return refuse(503, "unavailable");
  }
}
