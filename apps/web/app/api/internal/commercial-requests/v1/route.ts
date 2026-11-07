import { NextResponse } from "next/server";

import { authorizeCommercialRequestsFeed } from "@/lib/api/commercial-requests-feed-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CLOSED_REQUEST_STATUS_FILTER,
  COMMERCIAL_REQUEST_READ_COLUMNS,
  COMMERCIAL_REQUESTS_FEED_SCHEMA,
  type CommercialRequestRow,
  decodeFeedCursor,
  feedCursorFilter,
  feedPage,
  parseFeedLimit,
} from "@/lib/staffing/commercial-requests-feed";

/**
 * COMMERCIAL REQUESTS FEED: the pull door for Agentai OS (owner decision 2026-11-07).
 *
 * Oldest first by (created_at, id). A caller can repeat a pull safely and resume from
 * its last cursor, and dedupes on `id`. A null `nextCursor` means it has caught up: it
 * keeps its last cursor and pulls with that again later. The cursor moves on creation
 * only, so a later status change is not sent again.
 *
 * `?status=open` is the second read: every request not yet closed, with its current
 * status, so a caller tracking handling can see a change. Same shape and paging; start
 * it with no cursor each time and follow `nextCursor` to the end.
 *
 * 503 IS NOT AN EMPTY FEED: a failed read must never look like "no requests".
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

function refuse(status: number, reason: string): NextResponse {
  return NextResponse.json({ ok: false, reason }, { status, headers: NO_STORE });
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCommercialRequestsFeed(request);
  if (auth !== "ok") return refuse(401, auth);

  const params = new URL(request.url).searchParams;
  const limit = parseFeedLimit(params.get("limit"));
  if (limit === null) return refuse(400, "bad_limit");
  const rawCursor = params.get("after");
  const cursor = rawCursor === null ? null : decodeFeedCursor(rawCursor);
  if (rawCursor !== null && cursor === null) return refuse(400, "bad_cursor");

  const statusFilter = params.get("status");
  if (statusFilter !== null && statusFilter !== "open") return refuse(400, "bad_status");

  try {
    let query = createAdminClient()
      .from("company_need_public_intakes")
      .select(COMMERCIAL_REQUEST_READ_COLUMNS)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit + 1);
    if (cursor) query = query.or(feedCursorFilter(cursor));
    if (statusFilter === "open") query = query.not("status", "in", CLOSED_REQUEST_STATUS_FILTER);
    const { data, error } = await query;
    if (error || !data) return refuse(503, "unavailable");

    const { items, nextCursor } = feedPage(data as unknown as CommercialRequestRow[], limit);
    return NextResponse.json(
      { ok: true, schema: COMMERCIAL_REQUESTS_FEED_SCHEMA, items, nextCursor },
      { headers: NO_STORE },
    );
  } catch {
    return refuse(503, "unavailable");
  }
}
