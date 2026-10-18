import {
  buildFeedBody,
  type FeedBuild,
  type FeedReadOutcome,
} from "@/lib/supply-bridge/first-party-supply-emitter";

/**
 * Turning one RPC answer into a feed build.
 *
 * Deliberately NOT `server-only`, and deliberately takes the call as an
 * argument. Two callers need this exact logic and they cannot share a client:
 * the pull route runs inside the Next server bundle and uses
 * `lib/supabase/admin.ts` (which IS `server-only`), while
 * `scripts/emit-first-party-supply-feed.ts` runs under tsx, where importing a
 * `server-only` module throws by design. Duplicating the logic into the script
 * is how the two paths would drift — and the one that drifts silently is the
 * one that decides whether a failed read becomes a measured zero.
 *
 * So the injectable core lives here, and `feed-source.ts` is the thin
 * server-only wrapper that supplies the admin client.
 */

/** The shape both callers reduce their client to. */
export type FeedRpcResult = {
  data: unknown;
  error: { code?: string | null; message?: string } | null;
};

const MIGRATION_ABSENT = new Set(["42883", "42P01", "PGRST202", "PGRST204"]);

export type SupplyFeedRead = FeedBuild & {
  /** ISO instant the build ran. Written into the run log, never into a row. */
  readonly builtAtIso: string;
};

/**
 * "UNAVAILABLE" IS A RESULT, NOT AN ERROR TO SWALLOW.
 *
 * `data ?? []` on a failed read is the bug that makes a product lie: it turns
 * "we could not look" into "we looked and hold nobody", and the consumer will
 * repeat the second sentence to an employer. Every failure path below returns
 * `unavailable` with a reason, and `buildFeedBody` refuses to produce a file
 * body from it.
 */
export async function readFirstPartySupplyFeedWith(
  callRpc: () => Promise<FeedRpcResult>,
): Promise<SupplyFeedRead> {
  const builtAtIso = new Date().toISOString();

  let outcome: FeedReadOutcome;
  try {
    const { data, error } = await callRpc();
    if (error) {
      outcome = {
        kind: "unavailable",
        reason:
          error.code && MIGRATION_ABSENT.has(error.code)
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
      reason:
        cause instanceof Error
          ? `service env or client unavailable: ${cause.message}`
          : "service env or client unavailable",
    };
  }

  return { ...buildFeedBody(outcome), builtAtIso };
}
