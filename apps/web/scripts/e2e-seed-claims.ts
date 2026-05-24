/**
 * Local-only helper: seed (or delete) two test profile_skill_claims rows
 * for the owner so the e2e spec can render+verify the saved-display path
 * without depending on the server-action save round-trip.
 *
 * The PR #46 PR description and source-level guards already prove the
 * save action is wired correctly; this script lets the browser-driven
 * smoke focus on RENDER state, which is the user-visible bug the slice
 * actually fixes.
 *
 * Usage:
 *   E2E_OWNER_EMAIL=sukysdonatas@gmail.com pnpm tsx scripts/e2e-seed-claims.ts seed
 *   E2E_OWNER_EMAIL=sukysdonatas@gmail.com pnpm tsx scripts/e2e-seed-claims.ts cleanup
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
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

const SEED_ROWS = [
  { label: "Programavimas", normalized_label: "programavimas" },
  { label: "Namų statyba", normalized_label: "namų statyba" },
];

async function main(): Promise<void> {
  loadEnvLocal();
  const mode = (process.argv[2] ?? "seed").toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_OWNER_EMAIL;
  if (!url || !serviceKey || !email) {
    throw new Error(
      "Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + E2E_OWNER_EMAIL",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  if (profErr || !profile) {
    throw new Error(`profile not found for ${email}: ${profErr?.message}`);
  }
  const profileId = profile.id as string;

  if (mode === "cleanup") {
    const { error, count } = await admin
      .from("profile_skill_claims")
      .delete({ count: "exact" })
      .eq("profile_id", profileId)
      .in(
        "normalized_label",
        SEED_ROWS.map((r) => r.normalized_label),
      );
    if (error) throw new Error(`cleanup failed: ${error.message}`);
    console.log(
      `[e2e-seed] cleanup OK — removed ${count ?? 0} test row(s) for profile_id=${profileId.slice(0, 8)}…`,
    );
    return;
  }

  // Idempotent seed: upsert by (profile_id, normalized_label).
  const rows = SEED_ROWS.map((r) => ({
    profile_id: profileId,
    label: r.label,
    normalized_label: r.normalized_label,
  }));
  const { error: upErr } = await admin
    .from("profile_skill_claims")
    .upsert(rows, {
      onConflict: "profile_id,normalized_label",
      ignoreDuplicates: false,
    });
  if (upErr) throw new Error(`seed failed: ${upErr.message}`);

  // Verify by reading back via service role.
  const { data: read, error: readErr } = await admin
    .from("profile_skill_claims")
    .select("label, normalized_label, source, status, visibility")
    .eq("profile_id", profileId)
    .in(
      "normalized_label",
      SEED_ROWS.map((r) => r.normalized_label),
    )
    .order("created_at", { ascending: true });
  if (readErr) throw new Error(`verify failed: ${readErr.message}`);
  console.log(
    `[e2e-seed] seed OK — ${read?.length ?? 0} row(s) live for profile_id=${profileId.slice(0, 8)}…`,
  );
}

main().catch((err) => {
  console.error("[e2e-seed] FAILED:", (err as Error).message);
  process.exit(1);
});
