import { NextResponse } from "next/server";

import { authorizeSupplyFeedRequest } from "@/lib/api/supply-feed-auth";
import { readFirstPartySupplyFeed } from "@/lib/supply-bridge/feed-source";

/**
 * FIRST-PARTY SUPPLY FEED — the authorised pull door.
 *
 * The partner network (Agentai OS) fetches this and writes the body to
 * `runtime/labourmarket-supply/first-party-supply-feed.jsonl` on its own side.
 * Pull rather than push, because the alternatives are worse: a shared
 * filesystem couples two deployments that must be able to fail separately, and
 * a push from here would need a credential for the other product's disk.
 *
 * AUTH: `lib/api/supply-feed-auth.ts` — a dedicated machine secret, constant-
 * time compared, and REFUSED while unset. There is no cookie path and no user
 * path: this endpoint answers with every authorised person's projection at
 * once, which no signed-in account has any business asking for.
 *
 * WHAT A CALLER CAN AND CANNOT LEARN
 * ---------------------------------------------------------------------------
 * The body is exactly the v1 projection: opaque `actorRef`, trades,
 * availability, geography, agreed markets, four authorities. No name, no email,
 * no phone, no address, no document — the emitting SQL has no such columns in
 * its select list and the emitter drops any row that grew one.
 *
 * 503 IS NOT AN EMPTY FEED
 * ---------------------------------------------------------------------------
 * A failed read answers 503 with no body. It must never answer 200 with zero
 * rows, because the consumer would record that as "we looked and hold nobody"
 * and repeat it to an employer. `Content-Length: 0` on a 200 is a measurement;
 * a 503 is an outage. The consumer's own rule — absent file means
 * SUPPLY_SOURCE_UNAVAILABLE — only works if this end keeps them apart too.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeSupplyFeedRequest(request);
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, reason: auth }, { status: 401 });
  }

  const feed = await readFirstPartySupplyFeed();
  if (feed.body === null) {
    return NextResponse.json(
      { ok: false, reason: "unavailable", detail: feed.unavailableReason },
      { status: 503 },
    );
  }

  // Counts only in the headers — never an id, never a country breakdown that
  // could re-identify a single person in a small market.
  return new NextResponse(feed.body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-feed-schema": "agentai-first-party-market-signal/v1",
      "x-feed-built-at": feed.builtAtIso,
      "x-feed-rows": String(feed.emitted?.signals.length ?? 0),
      "x-feed-rejected": String(feed.emitted?.rejected.length ?? 0),
    },
  });
}
