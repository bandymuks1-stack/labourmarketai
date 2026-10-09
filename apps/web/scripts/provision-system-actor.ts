/**
 * Provision the dedicated SYSTEM identity used by the expiry sweeps
 * (migration 20261009150000_expiry_sweeps_service_role_v1, RED, owner-gated).
 *
 * WHAT IT CREATES: ONE auth user with the fixed id below — banned, no password,
 * no role metadata, a non-routable email — whose profile row is then role-less
 * (active_role NULL, no profile_roles) and therefore NOT an admin. The
 * auto-created `workers` row (trigger ensure_worker_profile) is removed so the
 * identity never counts as a worker.
 *
 * This is an OWNER-RUN step for production (Admin API). It refuses any target
 * that is not explicitly named by SYSTEM_ACTOR_SUPABASE_URL +
 * SYSTEM_ACTOR_SERVICE_KEY, never reads a local env file, and prints no key. The
 * fixed id must equal public.expiry_sweep_actor_id_v1() in the migration.
 *
 *   SYSTEM_ACTOR_SUPABASE_URL=... SYSTEM_ACTOR_SERVICE_KEY=... \
 *     pnpm tsx scripts/provision-system-actor.ts [--apply]
 *
 * Without --apply it only reports what it would do.
 */
import { createClient } from "@supabase/supabase-js";

export const SYSTEM_ACTOR_ID = "1fb04546-50e6-4214-b579-656d34a3bc9e";
export const SYSTEM_ACTOR_EMAIL = "system+expiry-sweeps@system.invalid";

async function main(): Promise<void> {
  const url = process.env.SYSTEM_ACTOR_SUPABASE_URL;
  const key = process.env.SYSTEM_ACTOR_SERVICE_KEY;
  if (!url || !key) {
    console.error(
      "Set SYSTEM_ACTOR_SUPABASE_URL and SYSTEM_ACTOR_SERVICE_KEY explicitly (nothing is read from a local env file).",
    );
    process.exitCode = 2;
    return;
  }
  const apply = process.argv.includes("--apply");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const existing = await admin.auth.admin.getUserById(SYSTEM_ACTOR_ID);
  if (existing.data?.user) {
    console.log(`system actor already exists (id=${SYSTEM_ACTOR_ID}); nothing to create.`);
  } else if (!apply) {
    console.log(`DRY RUN: would create banned role-less auth user id=${SYSTEM_ACTOR_ID} (${SYSTEM_ACTOR_EMAIL}).`);
  } else {
    const created = await admin.auth.admin.createUser({
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      email_confirm: false,
      ban_duration: "876000h",
      user_metadata: { system: true },
      app_metadata: { system_actor: "expiry-sweeps" },
    });
    if (created.error) {
      console.error(`createUser failed: ${created.error.message}`);
      process.exitCode = 1;
      return;
    }
    console.log("created banned role-less system actor.");
  }

  if (apply) {
    // The signup trigger inserts a `workers` row for every profile; the system
    // identity must never count as a worker.
    const del = await admin.from("workers").delete().eq("profile_id", SYSTEM_ACTOR_ID);
    console.log(del.error ? `workers cleanup: ${del.error.message} (do it in SQL)` : "workers row removed (if any).");
    const prof = await admin.from("profiles").update({ full_name: "LabourMarket system" }).eq("id", SYSTEM_ACTOR_ID);
    console.log(prof.error ? `profile name: ${prof.error.message}` : "profile named 'LabourMarket system'.");
  }
}

void main();
