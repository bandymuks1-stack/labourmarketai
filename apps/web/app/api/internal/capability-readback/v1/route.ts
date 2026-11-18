import { NextResponse } from "next/server";

import { buildCapabilityReadback, withRealIntakeCount } from "@/lib/api/capability-readback";
import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
import { readIntakeCountRows } from "@/lib/staffing/intake-test-rows";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CAPABILITY READBACK — aggregate counts for Agentai OS (owner 2026-10-21/22).
 *
 * Agentai OS cites LabourMarket.ai capabilities in employer outreach only while its capability contract is current, and
 * it re-measures that contract from this route four times a day (agentai: scripts/production/reverify-capability-
 * contract.ts). No database connection string is given to Agentai; this is the agreed first-party door.
 *
 * AUTH: the same machine secret as the supply feed (`lib/api/supply-feed-auth.ts`), constant-time compared. 503 while
 * the secret is unset (fail-closed, and what the consumer reads as "the route's own secret is unset"), 401 on a wrong
 * token. No cookie or user path.
 *
 * BODY: `{ schema, builtAtIso, counts }` — non-negative integer COUNTS only (`lib/api/capability-readback.ts`), all from
 * `agentai_capability_readback_counts_v1()` (definer rights, EXECUTE for service_role only — the service role here is
 * not granted SELECT on most of the counted tables, the same reason `ops_product_metrics_v1` exists). No row, name, id
 * or address. A failed or incomplete read is 503 with no counts, never a 200 with zeros.
 *
 * ONE EXCEPTION, `company_need_public_intakes` (owner 2026-11-14): the number of REAL requests, the rows the
 * commercial-requests feed passes. It is counted from one service-role read of the intake rows (status and the four
 * texts the test-row rule reads; `lib/staffing/intake-test-rows.ts`); no name or address leaves this route. If that
 * read fails, the whole response is 503, never the unfiltered count.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth === "not_configured") return NextResponse.json({ ok: false, reason: auth }, { status: 503 });
  if (auth !== "ok") return NextResponse.json({ ok: false, reason: auth }, { status: 401 });

  const builtAtIso = new Date().toISOString();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("agentai_capability_readback_counts_v1");
    const counted = error ? null : buildCapabilityReadback(data, builtAtIso);
    // Real requests only: our own test rows leave the intake count exactly as they leave the feed.
    const body = counted === null ? null : withRealIntakeCount(counted, await readIntakeCountRows(admin));
    if (body === null) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
    return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
