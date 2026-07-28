/**
 * pnpm lmc:expire-lots [--limit N] [--dry-run]
 *
 * Runs the ledger's promotional-lot expiry (`lmc_expire_lots_v1`).
 *
 * WHY THIS FILE EXISTS: the expiry function has been live in production since
 * 2026-07-21 with NO caller anywhere — no route, no action, no cron, no script
 * (commercial readiness audit, finding F14). Expiry is the mechanism that sheds
 * LMC liability: unrun, every promotional credit stays an open euro-denominated
 * obligation forever, regardless of the 60-day expiry the lots were issued with.
 *
 * Safety:
 *   - the RPC is service_role-only, so this script needs the service key and can
 *     never be triggered from the product;
 *   - it is idempotent (one expiry transaction per lot, enforced by a derived
 *     idempotency key and a unique index) — a second run is a no-op;
 *   - it only touches lots whose `expires_at` has already passed; purchased lots
 *     have no expiry and are structurally out of reach;
 *   - `--dry-run` reports what WOULD expire and writes nothing.
 *
 * Intended to run on a schedule (daily is enough for a 60-day expiry window).
 * Run with cwd = apps/web (pnpm -C apps/web lmc:expire-lots).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      )
        val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { requireSupabaseServiceEnv } = await import("../lib/env");
  let url: string;
  let serviceRoleKey: string;
  try {
    ({ url, serviceRoleKey } = requireSupabaseServiceEnv());
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
    return;
  }

  const limit = Number(argValue("--limit") ?? 100);
  if (!Number.isInteger(limit) || limit <= 0) {
    console.error("--limit must be a positive integer");
    process.exit(1);
    return;
  }
  const dryRun = process.argv.includes("--dry-run");

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`LMC lot expiry — target ${url}${dryRun ? " (dry run)" : ""}`);

  // Always report the outstanding expired remainder first: this is the euro
  // liability the run is about to shed, and it is the number to reconcile
  // against the admin liability panel.
  const { data: due, error: dueError } = await admin
    .from("lmc_lot_balances")
    .select("lot_id, source_kind, remaining_cents, expires_at, is_expired")
    .eq("is_expired", true)
    .gt("remaining_cents", 0)
    .limit(limit);
  if (dueError) {
    console.error(`Could not read lot balances: ${dueError.message}`);
    process.exit(1);
    return;
  }
  const rows = due ?? [];
  const totalCents = rows.reduce(
    (acc, r) => acc + Number((r as { remaining_cents: unknown }).remaining_cents ?? 0),
    0,
  );
  console.log(
    `  expired lots with remainder: ${rows.length} (${(totalCents / 100).toFixed(2)} LMC)`,
  );

  if (dryRun) {
    console.log("  dry run — nothing was written.");
    return;
  }
  if (rows.length === 0) {
    console.log("  nothing to expire.");
    return;
  }

  const { data, error } = await admin.rpc("lmc_expire_lots_v1", {
    p_limit: limit,
  });
  if (error) {
    console.error(`Expiry failed: ${error.message}`);
    process.exit(1);
    return;
  }
  const expired = (data as { expired_lots?: number } | null)?.expired_lots ?? 0;
  console.log(`  expired ${expired} lot(s).`);
  if (rows.length === limit) {
    console.log(
      `  NOTE: the batch was full (${limit}); run again to continue.`,
    );
  }
}

void main();
