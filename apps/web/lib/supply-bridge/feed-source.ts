import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  readFirstPartySupplyFeedWith,
  type SupplyFeedRead,
} from "@/lib/supply-bridge/feed-read";

/**
 * Reading the canonical state for the feed, inside the Next server bundle.
 *
 * SERVICE ROLE, and only here. `first_party_supply_feed_v1()` is granted to
 * `service_role` alone — never to `authenticated` — because it answers with
 * every authorised person at once. That is a legitimate thing for the emitter
 * to do and an illegitimate thing for a signed-in account to do, and a GRANT is
 * the only place that distinction can be enforced rather than remembered.
 * (Proven: the same call as `authenticated` fails SQLSTATE 42501.)
 *
 * The authority filter is INSIDE that SQL function. Nothing in this file
 * re-decides consent, and nothing in this file may widen what it returned — a
 * second opinion about consent is a second chance to get consent wrong.
 *
 * The decision logic lives in `feed-read.ts` so the operator script, which
 * cannot import a `server-only` module, runs the identical code path.
 */

export type { SupplyFeedRead } from "@/lib/supply-bridge/feed-read";

export async function readFirstPartySupplyFeed(): Promise<SupplyFeedRead> {
  return readFirstPartySupplyFeedWith(async () => {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await supabase.rpc("first_party_supply_feed_v1" as any)) as {
      data: unknown;
      error: { code?: string | null; message?: string } | null;
    };
  });
}
