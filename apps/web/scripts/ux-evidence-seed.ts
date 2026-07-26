/**
 * LOCAL-ONLY, ON-DEMAND: create the profile-growth evidence user.
 *
 * The UX 2.0 growth bar must be shown at 0/5, 4/5 and 5/5, but the local
 * fixture worker sits at 2/5 and is shared by every other authenticated spec.
 * Rather than delete that worker's rows (which risks cascading fixture data
 * away), this creates ONE dedicated local user and the growth spec then builds
 * it up additively. Nothing existing is mutated.
 *
 * FAIL-CLOSED exactly like `e2e-mint-session.ts`: the target comes from
 * `E2E_SUPABASE_*` or `npx supabase status` only, and `resolveLocalSupabaseEnv`
 * refuses any non-loopback host, `supabase.co`, the production project ref or a
 * Supabase Cloud key. It cannot create a cloud user.
 *
 *   pnpm tsx scripts/ux-evidence-seed.ts
 */
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NonLocalTargetError, REFUSAL_CODE } from "../lib/testing/local-supabase-guard";
import { describeLocalTarget, resolveLocalSupabaseEnv } from "../lib/testing/local-supabase-env";

const REPO_ROOT = join(__dirname, "..", "..", "..");
export const EVIDENCE_EMAIL = "dev.ux-evidence@local.test";

async function main(): Promise<void> {
  const local = resolveLocalSupabaseEnv(REPO_ROOT);
  console.log(`[ux-evidence-seed] ${describeLocalTarget(local)}`);

  const admin = createClient(local.url, local.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Reuse the user across runs so repeated evidence passes stay idempotent.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users.find((u) => u.email === EVIDENCE_EMAIL) ?? null;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EVIDENCE_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: "Ugnė" },
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    user = data.user;
    console.log(`[ux-evidence-seed] created ${EVIDENCE_EMAIL}`);
  } else {
    console.log(`[ux-evidence-seed] reusing ${EVIDENCE_EMAIL}`);
  }

  // A profile row is required; the worker row is what makes the summary report
  // "0 of 5" instead of the honest "this account has no worker profile".
  // `onboarded` + `active_role` are what the real role-selection step writes.
  // Without them the app correctly routes this account to onboarding instead of
  // the conversation — so the evidence run has to complete that step honestly
  // rather than skip past it.
  await admin.from("profiles").upsert(
    {
      id: user.id,
      full_name: "Ugnė",
      locale: "lt",
      country: "LT",
      onboarded: true,
      active_role: "worker",
      onboarded_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  const { data: worker } = await admin
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) {
    const { error } = await admin
      .from("workers")
      .insert({ profile_id: user.id, display_name: "Ugnė" });
    if (error) throw new Error(`worker insert failed: ${error.message}`);
  }

  // Start every evidence run from a genuine 0/5: no about text, no claims, no
  // languages, no availability, no work history.
  await admin.from("profiles").update({ profile_text: null }).eq("id", user.id);
  await admin.from("workers").update({ availability_status: null }).eq("profile_id", user.id);
  await admin.from("profile_skill_claims").delete().eq("profile_id", user.id);
  await admin.from("engagement_contexts").delete().eq("profile_id", user.id);
  const { data: w } = await admin
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (w) await admin.from("worker_languages").delete().eq("worker_id", w.id);

  console.log(`[ux-evidence-seed] ready at 0/5 (id=${user.id.slice(0, 8)}…)`);
}

main().catch((err) => {
  if (err instanceof NonLocalTargetError) {
    console.error(`[ux-evidence-seed] ${REFUSAL_CODE} — nothing was created.`);
    console.error(err.message);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
