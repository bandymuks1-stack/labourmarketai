/**
 * Build `runtime/labourmarket-supply/first-party-supply-feed.jsonl` from the
 * canonical consent state.
 *
 *   pnpm -F web supply-feed:emit            # write the file, print the summary
 *   pnpm -F web supply-feed:emit --dry-run  # print the summary, write nothing
 *
 * Needs the service-role key (`.env.local`, or the environment) because
 * `first_party_supply_feed_v1()` is granted to `service_role` alone.
 *
 * This is the operator path and the proof path; the production path is the
 * authorised pull at `/api/internal/supply-feed/first-party-v1`. Both go through
 * `readFirstPartySupplyFeedWith`, so the decision that matters most — whether a
 * failed read becomes a measured zero — cannot differ between them.
 *
 * It creates the Supabase client directly rather than importing
 * `lib/supabase/admin.ts`, which is `server-only` and throws outside a React
 * Server bundle. Same reason and same shape as `scripts/admin-promote.ts`.
 *
 * The run summary is the thing to actually read. `authorityCounts` is where a
 * blanket-GRANTED bug becomes visible: if `contactAuthority` equals the row
 * count on a real population, something is granting instead of reading.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { feedPathFor, writeFeedFile } from "@/lib/supply-bridge/feed-file";
import { readFirstPartySupplyFeedWith } from "@/lib/supply-bridge/feed-read";

/** The repo root, two levels above apps/web. */
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

/** Same loader the other operator scripts use (see scripts/admin-promote.ts). */
function loadEnvLocal(): void {
  const candidates = [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), "..", "..", ".env.local"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.startsWith("<")) continue;
      if (
        (val.startsWith('"') && val.endsWith('"'))
        || (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const feed = await readFirstPartySupplyFeedWith(async () => {
    if (!url || !serviceRoleKey) {
      // Missing credentials is UNKNOWN, never zero. Returning an empty array
      // here would write a file claiming we hold nobody.
      return {
        data: null,
        error: {
          code: "no_service_env",
          message:
            "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
        },
      };
    }
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await (supabase as any).rpc("first_party_supply_feed_v1")) as {
      data: unknown;
      error: { code?: string | null; message?: string } | null;
    };
  });

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
