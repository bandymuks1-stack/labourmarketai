/**
 * OWNER-RUN. Provision the ONE synthetic production QA worker account.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SCRIPT AND NOT SOMETHING THE AGENT RAN
 *
 * Creating an account is an owner action. The agent that wrote this file
 * declined to execute it: account creation and credential handling sit outside
 * what it may do, and an explicit authorisation does not change that. So the
 * privileged step stays with the person who owns the project, and everything
 * around it — the guard, the mint, the whole gate suite — is already built and
 * waiting.
 *
 * Run it once:
 *
 *   PROD_QA_SUPABASE_URL=https://<ref>.supabase.co \
 *   PROD_QA_SERVICE_ROLE_KEY=<service-role key> \
 *   pnpm -C apps/web exec tsx scripts/prod-qa-provision.ts --i-understand-production
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, EXACTLY
 *
 *  - creates ONE auth user, `qa.worker+goal3@labourmarket.ai`, hard-coded in
 *    `lib/testing/prod-qa-guard.ts` and refusing every other address;
 *  - the account is PASSWORDLESS by design. Sessions come from a magic-link
 *    OTP, so no password for this identity exists anywhere — not in the repo,
 *    not in a secret store, not in a screenshot;
 *  - it marks the user confirmed so the QA flow does not require a mailbox;
 *  - it writes `app_metadata.qa_synthetic = true` and a purpose string, so the
 *    account is identifiable as synthetic from the database alone.
 *
 * WHAT IT DOES NOT DO
 *
 *  - it does not change Auth settings, RLS policies, grants or any
 *    security-definer function;
 *  - it does not create an endpoint. This is a one-shot script;
 *  - it does not print keys or tokens;
 *  - it is idempotent: if the account already exists it reports that and exits
 *    0 without modifying it.
 *
 * REMOVAL — see `docs/audits/evidence/premium-rebuild/prod-qa-account.md`.
 * Run with `--revoke` to ban the account (sessions die, the row stays for
 * audit); the owner deletes it from the Supabase dashboard when it is no
 * longer wanted.
 */
import { createClient } from "@supabase/supabase-js";

import {
  PROD_QA_AGENCY_EMAIL,
  PROD_QA_FRESH_IDENTITIES,
  PROD_QA_WORKER_EMAIL,
  ProdQaGuardError,
  assertProdQaTarget,
  describeProdQaTarget,
} from "../lib/testing/prod-qa-guard";
import { findAuthUserByEmail } from "../lib/testing/prod-qa-find-user";

const ACK = "--i-understand-production";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const revoke = argv.includes("--revoke");

  // The acknowledgement is deliberate friction. A script that writes to a
  // production auth schema should never run because someone pressed up-arrow.
  if (!argv.includes(ACK)) {
    fail(
      `refusing to touch production without ${ACK}.\n` +
        "This creates a real account in the production project.",
    );
    return;
  }

  const url = process.env.PROD_QA_SUPABASE_URL;
  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    fail(
      "PROD_QA_SERVICE_ROLE_KEY is not set. Supply it through your approved " +
        "secret/environment path — never on the command line, where it lands " +
        "in shell history.",
    );
    return;
  }

  let target;
  try {
    target = assertProdQaTarget({
      url,
      // Only an allowlisted identity is accepted (assertProdQaTarget). Default:
      // the original worker; PROD_QA_PROVISION_IDENTITY selects the synthetic agency.
      email: process.env.PROD_QA_PROVISION_IDENTITY ?? PROD_QA_WORKER_EMAIL,
      serviceKey,
    });
  } catch (err) {
    if (err instanceof ProdQaGuardError) {
      fail(err.message);
      return;
    }
    throw err;
  }

  // Origin + identity only. Never the key.
  console.info(`[prod-qa] ${describeProdQaTarget(target)}`);

  const admin = createClient(target.origin, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existing = await findAuthUserByEmail(admin, target.email);

  if (revoke) {
    if (!existing) {
      console.info("[prod-qa] nothing to revoke — the account does not exist.");
      return;
    }
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      ban_duration: "876000h", // ~100 years; the row survives for audit.
    });
    if (error) {
      fail(`revoke failed: ${error.message}`);
      return;
    }
    console.info(
      `[prod-qa] REVOKED ${target.email} (id=${existing.id.slice(0, 8)}…). ` +
        "Its sessions are dead. Delete the row from the Supabase dashboard " +
        "when you no longer need the audit trail.",
    );
    return;
  }

  if (existing) {
    console.info(
      `[prod-qa] already provisioned (id=${existing.id.slice(0, 8)}…). ` +
        "Nothing was modified.",
    );
    return;
  }

  // A FRESH identity starts exactly like a real new account: no role and no
  // locale in its metadata, so the profile trigger leaves `active_role` empty
  // and the onboarding wizard — the thing being proven — asks for everything.
  const fresh = PROD_QA_FRESH_IDENTITIES.includes(target.email);
  const { data, error } = await admin.auth.admin.createUser({
    email: target.email,
    // No password. Sessions are minted through a magic-link OTP, so this
    // identity has no credential that could be leaked or reused.
    email_confirm: true,
    app_metadata: {
      qa_synthetic: true,
      qa_purpose: fresh
        ? "labourmarket.ai production E2E — fresh activation (owner decision 2026-10-26)"
        : "labourmarket.ai production E2E — EMPLOYEE_BETA_PRODUCTION_GATE",
      qa_provisioned_by: "owner",
    },
    user_metadata: fresh
      ? {}
      : {
          role: target.email === PROD_QA_AGENCY_EMAIL ? "agency" : "worker",
          locale: "lt",
        },
  });

  if (error || !data?.user) {
    fail(`createUser failed: ${error?.message ?? "no user returned"}`);
    return;
  }

  console.info(
    `[prod-qa] PROVISIONED ${target.email} (id=${data.user.id.slice(0, 8)}…), ` +
      "passwordless, app_metadata.qa_synthetic=true.",
  );
  console.info(
    "[prod-qa] next: mint a session with scripts/prod-qa-mint-session.ts, " +
      "then run tests/e2e/employee-beta-gate.spec.ts.",
  );
}

function fail(message: string): void {
  console.error(`\n[prod-qa] REFUSED\n${message}\n`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[prod-qa] FAILED:", (err as Error).message ?? String(err));
  process.exit(1);
});
