/**
 * OWNER-RUN (through `.github/workflows/prod-qa-invited-provision.yml`).
 * The synthetic INVITED worker for the "registers without the link" walk
 * (owner decision 2026-10-28).
 *
 *   --provision  1. stores ONE synthetic partner referral for
 *                   `qa.invited+act1@labourmarket.ai` through the SAME database
 *                   function the partner door calls (`receive_external_referral_v1`,
 *                   service_role only). Reference `QA-SYNTHETIC-invited-act1`,
 *                   consent text marked QA-SYNTHETIC, empty declared context.
 *                   That function writes the invitation and an audit row and
 *                   calls nobody — the partner is not contacted.
 *                2. creates the account exactly like the fresh pair: confirmed,
 *                   passwordless, `app_metadata.qa_synthetic = true`, NO role or
 *                   locale — so onboarding starts like a real new account's and
 *                   the person arrives WITHOUT `?next=/invite/<token>`.
 *   --revoke     bans the account (sessions die). Deleting the account and its
 *                rows is the owner's separate, guarded SQL
 *                (`docs/qa/invited-worker-purge.sql`), because service_role holds
 *                no table grant on `invitations` and the accepted invitation
 *                blocks deleting the profile.
 *
 * Refuses every address but the one allowlisted identity, refuses without
 * `--i-understand-production`, prints origin, address and a short id prefix
 * only — never a key, token or link. Idempotent.
 */
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { findExternalReferralSource } from "../lib/invitations/external-sources";
import {
  PROD_QA_INVITED_EMAIL,
  ProdQaGuardError,
  assertProdQaTarget,
  describeProdQaTarget,
} from "../lib/testing/prod-qa-guard";
import { findAuthUserByEmail } from "../lib/testing/prod-qa-find-user";

const ACK = "--i-understand-production";
export const QA_INVITED_REFERENCE = "QA-SYNTHETIC-invited-act1";

function fail(message: string): void {
  console.error(`[prod-qa-invited] ${message}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const provision = argv.includes("--provision");
  const revoke = argv.includes("--revoke");
  if (!argv.includes(ACK)) return fail(`refusing to touch production without ${ACK}.`);
  if (provision === revoke) return fail("exactly one of --provision / --revoke.");

  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail("PROD_QA_SERVICE_ROLE_KEY is not set (approved secret path only).");
  let target;
  try {
    target = assertProdQaTarget({ url: process.env.PROD_QA_SUPABASE_URL, email: PROD_QA_INVITED_EMAIL, serviceKey });
  } catch (err) {
    if (err instanceof ProdQaGuardError) return fail(err.message);
    throw err;
  }
  console.info(`[prod-qa-invited] ${describeProdQaTarget(target)}`);
  const admin = createClient(target.origin, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = await findAuthUserByEmail(admin, target.email);

  if (revoke) {
    if (!existing) return console.info("[prod-qa-invited] nothing to revoke — the account does not exist.");
    const { error } = await admin.auth.admin.updateUserById(existing.id, { ban_duration: "876000h" });
    if (error) return fail(`revoke failed: ${error.message}`);
    console.info(
      `[prod-qa-invited] REVOKED (id=${existing.id.slice(0, 8)}…). Sessions are dead. ` +
        "Delete the account and its rows with docs/qa/invited-worker-purge.sql.",
    );
    return;
  }

  // 1. The synthetic partner referral FIRST — a real referred person is invited
  //    before they register. Replays answer `duplicate` (idempotent).
  const source = findExternalReferralSource("nonstop");
  if (!source) return fail("the partner source is not registered.");
  const token = randomBytes(32).toString("base64url"); // discarded: the walk arrives WITHOUT the link
  const { data, error } = await admin.rpc("receive_external_referral_v1", {
    p_source_slug: source.slug,
    p_reference: QA_INVITED_REFERENCE,
    p_token_hash: createHash("sha256").update(token).digest("hex"),
    p_invited_email: target.email,
    p_invited_name: "QA-SYNTHETIC Pakviestas darbuotojas",
    p_locale: "lt",
    p_declared_context: {},
    p_consent: {
      given: true,
      version: source.consentVersion,
      text: "QA-SYNTHETIC consent — production E2E of the invited-worker path (owner decision 2026-10-28)",
      received_at: new Date().toISOString(),
    },
    p_required_consent_version: source.consentVersion,
    p_expires_in_days: 14,
  });
  if (error) return fail(`referral not stored: ${error.code ?? "error"}`);
  const outcome = String((data as { outcome?: string } | null)?.outcome ?? "error");
  if (outcome !== "created" && outcome !== "duplicate") return fail(`referral refused: ${outcome}`);
  console.info(`[prod-qa-invited] synthetic referral ${outcome}`);

  // 2. The account, like the fresh pair: no role, no locale, no link.
  if (existing) {
    return console.info(`[prod-qa-invited] account already provisioned (id=${existing.id.slice(0, 8)}…). Nothing modified.`);
  }
  const created = await admin.auth.admin.createUser({
    email: target.email,
    email_confirm: true,
    app_metadata: {
      qa_synthetic: true,
      qa_purpose: "labourmarket.ai production E2E — invited worker registers without the link (owner decision 2026-10-28)",
      qa_provisioned_by: "owner",
    },
    user_metadata: {},
  });
  if (created.error || !created.data.user) return fail(`account not created: ${created.error?.message ?? "no user"}`);
  console.info(`[prod-qa-invited] PROVISIONED (id=${created.data.user.id.slice(0, 8)}…).`);
}

void main();
