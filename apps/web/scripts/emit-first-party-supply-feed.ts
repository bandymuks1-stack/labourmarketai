/**
 * Build `runtime/labourmarket-supply/first-party-supply-feed.jsonl` from the
 * canonical consent state.
 *
 *   pnpm -F web supply-feed:emit            # write the file, print the summary
 *   pnpm -F web supply-feed:emit --dry-run  # print the summary, write nothing
 *
 * Needs the service-role env (SUPABASE_SERVICE_ROLE_KEY) because
 * `first_party_supply_feed_v1()` is granted to service_role alone.
 *
 * This is the operator path and the proof path. The production path is the
 * authorised pull at `/api/internal/supply-feed/first-party-v1`, which shares
 * every line of logic below except the writing.
 *
 * The run summary is the thing to actually read. `authorityCounts` is where a
 * blanket-GRANTED bug becomes visible: if `contactAuthority` equals the row
 * count on a real population, something is granting instead of reading.
 */

import { relative, resolve } from "node:path";

import { feedPathFor, writeFeedFile } from "@/lib/supply-bridge/feed-file";
import { readFirstPartySupplyFeed } from "@/lib/supply-bridge/feed-source";

// The repo root, two levels above apps/web.
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const feed = await readFirstPartySupplyFeed();

  if (feed.body === null) {
    // Deliberately loud and deliberately non-zero exit: a silent failure here
    // would let a stale feed age out unnoticed, and the consumer would keep
    // quoting it until every row expired.
    console.error("[supply-feed] UNAVAILABLE — nothing written, previous file untouched");
    console.error(`[supply-feed] reason: ${feed.unavailableReason ?? "unknown"}`);
    process.exitCode = 1;
    return;
  }

  const emitted = feed.emitted;
  const target = feedPathFor(REPO_ROOT);

  console.log(`[supply-feed] built at ${feed.builtAtIso}`);
  console.log(`[supply-feed] rows emitted   : ${emitted?.signals.length ?? 0}`);
  console.log(`[supply-feed] rows rejected  : ${emitted?.rejected.length ?? 0}`);
  if (emitted && emitted.rejected.length > 0) {
    const byReason: Record<string, number> = {};
    for (const r of emitted.rejected) byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    console.log(`[supply-feed] rejected by    : ${JSON.stringify(byReason)}`);
  }
  console.log(`[supply-feed] by intent      : ${JSON.stringify(emitted?.byIntent ?? {})}`);
  console.log(`[supply-feed] authorities    : ${JSON.stringify(emitted?.authorityCounts ?? {})}`);

  if (dryRun) {
    console.log(`[supply-feed] --dry-run: would write ${relative(REPO_ROOT, target)}`);
    return;
  }

  const result = writeFeedFile(target, feed.body, feed.unavailableReason);
  if (result.kind === "skipped-unavailable") {
    console.error(`[supply-feed] skipped: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[supply-feed] wrote ${relative(REPO_ROOT, result.path)} (${result.bytes} bytes)`);
  if ((emitted?.signals.length ?? 0) === 0) {
    // An empty file is a real answer, and saying so out loud stops an operator
    // reading a 0-byte file as a broken run.
    console.log("[supply-feed] the file is empty: that is a measured zero, not a failure");
  }
}

main().catch((cause: unknown) => {
  console.error("[supply-feed] failed:", cause);
  process.exitCode = 1;
});
