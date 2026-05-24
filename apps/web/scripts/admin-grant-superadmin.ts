/**
 * pnpm admin:grant-superadmin --email <email> [--dry-run | --apply --i-understand-this-mutates-production]
 *
 * Grants the `admin` active_role to a profile, server-side, via the
 * service-role client. Replaces the prior `admin-promote` script which
 * was interactive and had no explicit dry-run guarantee — required
 * pattern for the controlled real-user pilot readiness sprint.
 *
 * Modes:
 *
 *   --dry-run (default if neither flag is set):
 *     Reads the target profile, prints what WOULD change. Performs ZERO
 *     writes. Safe to run at any time. Exit code reflects whether the
 *     grant would succeed (0) or fail (1).
 *
 *   --apply --i-understand-this-mutates-production:
 *     Performs the UPDATE. Requires BOTH flags — neither is sufficient
 *     on its own — so accidentally pasting half a command into a
 *     terminal can't trigger a production mutation.
 *
 * Idempotency: re-running --apply on a row that is already
 * `active_role = 'admin'` is a no-op (the UPDATE runs but the diff is
 * zero), and the audit line clearly reports "already admin".
 *
 * Auditability: every run prints a single timestamped JSON line with
 * the action, target email, role granted, mode, success state, and
 * any error. Suitable for `tee` into a local audit log.
 *
 * The script imports the service-role key from .env.local via
 * loadEnvLocal() — the SAME pattern admin-promote.ts uses. The key
 * is never echoed to the terminal.
 *
 * Run from apps/web:
 *
 *   pnpm tsx scripts/admin-grant-superadmin.ts --email you@example.com --dry-run
 *   pnpm tsx scripts/admin-grant-superadmin.ts --email you@example.com --apply --i-understand-this-mutates-production
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Args = {
  email: string | null;
  dryRun: boolean;
  apply: boolean;
  understand: boolean;
};

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
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    email: null,
    dryRun: false,
    apply: false,
    understand: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") {
      args.email = argv[i + 1] ?? null;
      i++;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "--apply") {
      args.apply = true;
    } else if (a === "--i-understand-this-mutates-production") {
      args.understand = true;
    }
  }
  return args;
}

function audit(record: Record<string, unknown>): void {
  // Single-line JSON for easy grep/tee. Sensitive bits (service-role
  // key, raw rows other than the target) NEVER printed.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      script: "admin-grant-superadmin",
      ...record,
    }),
  );
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (!args.email) {
    audit({
      action: "abort",
      reason: "missing --email",
      usage:
        "pnpm tsx scripts/admin-grant-superadmin.ts --email <email> --dry-run",
    });
    process.exit(1);
    return;
  }
  if (args.apply && !args.understand) {
    audit({
      action: "abort",
      reason:
        "--apply requires --i-understand-this-mutates-production for safety",
    });
    process.exit(1);
    return;
  }
  if (!args.apply && !args.dryRun) {
    // Default to dry-run when neither flag is passed — fail-safe.
    args.dryRun = true;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    audit({
      action: "abort",
      reason:
        "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    });
    process.exit(1);
    return;
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up the target profile by email. Single() returns null + error
  // if zero rows or >1 rows — both are show-stoppers; report and exit.
  const { data: profile, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email, active_role")
    .eq("email", args.email)
    .single();

  if (lookupErr || !profile) {
    audit({
      action: "abort",
      reason: "profile not found by email",
      email: args.email,
      details: lookupErr?.message ?? null,
    });
    process.exit(1);
    return;
  }

  const currentRole = profile.active_role ?? "(null)";
  const alreadyAdmin = profile.active_role === "admin";

  if (args.dryRun) {
    audit({
      action: alreadyAdmin ? "dry-run.noop" : "dry-run.would-grant",
      email: args.email,
      profileId: profile.id,
      currentRole,
      desiredRole: "admin",
      alreadyAdmin,
      mode: "dry-run",
    });
    process.exit(0);
    return;
  }

  // Apply path. The double-flag check earlier guarantees the operator
  // intended this. UPDATE is idempotent — running twice on an already-
  // admin row yields the same end state.
  const { error: updErr, data: updated } = await admin
    .from("profiles")
    .update({ active_role: "admin" })
    .eq("id", profile.id)
    .select("id, email, active_role");

  if (updErr) {
    audit({
      action: "apply.failed",
      email: args.email,
      profileId: profile.id,
      error: updErr.message,
      mode: "apply",
    });
    process.exit(1);
    return;
  }

  // Also persist the admin signal in profile_roles so the application
  // continues to recognise the admin after any subsequent workspace
  // switch (`switchActiveRole` overwrites profiles.active_role).
  // Idempotent via unique(profile_id, role).
  const { error: prErr } = await admin
    .from("profile_roles")
    .upsert(
      { profile_id: profile.id, role: "admin" },
      { onConflict: "profile_id,role" },
    );
  if (prErr) {
    audit({
      action: "apply.partial",
      email: args.email,
      profileId: profile.id,
      previousRole: currentRole,
      newRole: "admin",
      profileRolesUpsertError: prErr.message,
      mode: "apply",
    });
    process.exit(1);
    return;
  }

  audit({
    action: alreadyAdmin ? "apply.noop" : "apply.granted",
    email: args.email,
    profileId: profile.id,
    previousRole: currentRole,
    newRole: "admin",
    alreadyAdmin,
    profileRolesAdminUpserted: true,
    mode: "apply",
    rowsAffected: updated?.length ?? 0,
  });
}

main().catch((err) => {
  audit({
    action: "apply.unexpected-error",
    error: (err as Error).message,
  });
  process.exit(1);
});
