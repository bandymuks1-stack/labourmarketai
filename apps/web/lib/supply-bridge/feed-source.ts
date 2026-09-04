import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildFeedBody,
  type FeedBuild,
  type FeedReadOutcome,
} from "@/lib/supply-bridge/first-party-supply-emitter";

/**
 * Reading the canonical state for the feed.
 *
 * SERVICE ROLE, and only here. `first_party_supply_feed_v1()` is granted to
 * `service_role` alone — never to `authenticated` — because it answers with
 * every authorised person at once. That is a legitimate thing for the emitter
 * to do and an illegitimate thing for a signed-in account to do, and a GRANT is
 * the only place that distinction can be enforced rather than remembered.
 *
 * The authority filter is INSIDE that function. Nothing in this file re-decides
 * consent, and nothing in this file may widen what the function returned.
 *
 * "UNAVAILABLE" IS A RESULT, NOT AN ERROR TO SWALLOW
 * ---------------------------------------------------------------------------
 * `data ?? []` on a failed read is the bug that makes a product lie: it turns
 * "we could not look" into "we looked and hold nobody", and the consumer will
 * repeat the second sentence to an employer. Every failure path below returns
 * `unavailable` with a reason, and `buildFeedBody` refuses to produce a file
 * body from it.
 */

const MIGRATION_ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

export type SupplyFeedRead = FeedBuild & {
  /** ISO instant the build ran. Written into the sidecar, never into a row. */
  readonly builtAtIso: string;
};

export async function readFirstPartySupplyFeed(): Promise<SupplyFeedRead> {
  const builtAtIso = new Date().toISOString();

  let outcome: FeedReadOutcome;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .rpc("first_party_supply_feed_v1" as any);

    if (error) {
      outcome = {
        kind: "unavailable",
        reason: error.code && MIGRATION_ABSENT.has(error.code)
          ? "first_party_supply_feed_v1 is not applied to this database"
          : `feed rpc failed: ${error.code ?? "unknown"}`,
      };
    } else if (!Array.isArray(data)) {
      // A non-array is not an empty feed. It is a shape we do not understand,
      // and understanding it as zero supply is the expensive direction.
      outcome = { kind: "unavailable", reason: "feed rpc returned a non-array" };
    } else {
      outcome = { kind: "read", rows: data as unknown[] };
    }
  } catch (cause) {
    outcome = {
      kind: "unavailable",
      reason: cause instanceof Error
        ? `service env or client unavailable: ${cause.message}`
        : "service env or client unavailable",
    };
  }

  return { ...buildFeedBody(outcome), builtAtIso };
}
