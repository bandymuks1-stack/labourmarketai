/**
 * pnpm admin:promote <email> — flip a profile's role to 'admin'.
 *
 * No admin row is ever seeded (brief §10.2). The founder signs up normally,
 * then runs this against their own email. Uses the service-role key, so it
 * is destructive of access boundaries — it confirms interactively and
 * refuses non-interactively without --yes (same posture as placeholders).
 *
 * Run with cwd = apps/web (pnpm -C apps/web admin:promote <email>).
 * Imports the service client directly (NOT lib/supabase/admin.ts — that is
 * `server-only` and throws outside a React Server bundle).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

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

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) {
    console.error("Usage: pnpm admin:promote <email> [--yes]");
    process.exit(1);
    return;
  }

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

  const interactive = Boolean(process.stdin.isTTY);
  const forced = process.argv.includes("--yes");
  if (!interactive && !forced) {
    console.error(
      "Refusing to promote in non-interactive mode without --yes.",
    );
    process.exit(1);
    return;
  }

  console.log(`\nPromote to admin: ${email}`);
  console.log(`  target: ${url}`);
  if (interactive && !forced) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (await rl.question("Proceed? (yes/no) "))
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== "yes" && answer !== "y") {
      console.log("Aborted. Nothing changed.");
      return;
    }
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("profiles")
    .update({ role: "admin" })
    .eq("email", email)
    .select("id, email, role");

  if (error) {
    console.error(`Update failed: ${error.message}`);
    process.exit(1);
    return;
  }
  if (!data || data.length === 0) {
    console.error(
      `No profile with email "${email}". The user must sign up first ` +
        "(a profile row is created on signup), then re-run this.",
    );
    process.exit(1);
    return;
  }

  console.log(
    `\nDone. ${data.length} profile(s) now admin:`,
    data.map((p) => p.id).join(", "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
