import { NextResponse } from "next/server";

import { CAPABILITY_READBACK_TABLE_COUNTS, buildCapabilityReadback } from "@/lib/api/capability-readback";
import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
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
 * BODY: `{ schema, builtAtIso, counts }` — non-negative integer COUNTS only (`lib/api/capability-readback.ts`). Four
 * come from `agentai_capability_readback_counts_v1()` (an index-only full count and two DISTINCT counts); every other one
 * is an exact head-count of its whole table (no rows are fetched). All under the service role. No row, name, id or
 * address. A failed or incomplete read is 503 with no counts, never a 200 with zeros.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth === "not_configured") return NextResponse.json({ ok: false, reason: auth }, { status: 503 });
  if (auth !== "ok") return NextResponse.json({ ok: false, reason: auth }, { status: 401 });

  const builtAtIso = new Date().toISOString();
  try {
    const admin = createAdminClient();
    const fn = await admin.rpc("agentai_capability_readback_counts_v1");
    if (fn.error || typeof fn.data !== "object" || fn.data === null) {
      return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
    }
    const counts: Record<string, unknown> = { ...(fn.data as Record<string, unknown>) };
    const heads = await Promise.all(CAPABILITY_READBACK_TABLE_COUNTS.map(async (table) => {
      const r = await admin.from(table).select("*", { count: "exact", head: true });
      return [table, r.error ? null : r.count] as const;
    }));
    for (const [table, n] of heads) counts[table] = n;
    const body = buildCapabilityReadback(counts, builtAtIso);
    if (body === null) return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
    return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, reason: "unavailable" }, { status: 503 });
  }
}
