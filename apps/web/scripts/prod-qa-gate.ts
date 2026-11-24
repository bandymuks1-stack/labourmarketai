/**
 * THE ONE COMMAND. Provision → mint → run the EMPLOYEE_BETA_PRODUCTION_GATE.
 *
 *   pnpm -C apps/web prod-qa:gate
 *
 * Three env vars, set once through your approved secret path, and nothing else
 * to remember:
 *
 *   PROD_QA_SUPABASE_URL        https://<project-ref>.supabase.co
 *   PROD_QA_ANON_KEY            the project's anon key
 *   PROD_QA_SERVICE_ROLE_KEY    the project's service-role key
 *
 * WHAT IT DOES, IN ORDER
 *
 *   1. PROVISION — creates ONE passwordless synthetic user,
 *      `qa.worker+goal3@labourmarket.ai`, marked `app_metadata.qa_synthetic`.
 *      Idempotent: if it exists, nothing is modified.
 *   2. VERIFY — reads the account back and prints its id prefix, confirmed
 *      state and synthetic marker. Creation is never assumed from an exit code.
 *   3. MINT — a magic-link OTP session, written to a gitignored file.
 *   4. GATE — runs the full authenticated production suite, desktop + mobile.
 *
 * Each step refuses rather than degrades. A failure at any step stops the run
 * and says which step and why; the gate never runs against a half-set-up state,
 * because a gate that runs on the wrong premise is worse than one that did not
 * run.
 *
 * WHAT IT NEVER DOES
 *
 *   - no password is created, typed or stored — the account is passwordless;
 *   - no key or token is printed, and none is passed as an argv (where it would
 *     land in shell history) — everything comes from the environment;
 *   - it changes no Auth setting, no RLS policy, no grant and no
 *     security-definer function;
 *   - it writes no production domain data. The only production write in the
 *     whole flow is the creation of that one auth row.
 *
 * TEARDOWN
 *
 *   pnpm -C apps/web prod-qa:revoke     bans the account; sessions die at once
 *
 * The full account record — scope, what RLS denies it, and the two-step removal
 * — is `docs/audits/evidence/premium-rebuild/prod-qa-account.md`.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { CANONICAL_ORIGIN } from "../lib/domain/canonical";
import {
  PROD_QA_WORKER_EMAIL,
  ProdQaGuardError,
  assertProdQaTarget,
  describeProdQaTarget,
} from "../lib/testing/prod-qa-guard";

const STEPS = 4;

async function main(): Promise<void> {
  const revokeOnly = process.argv.includes("--revoke");

  const url = process.env.PROD_QA_SUPABASE_URL;
  const anonKey = process.env.PROD_QA_ANON_KEY;
  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || (!revokeOnly && !anonKey)) {
    fail(
      "missing environment.\n\n" +
        "  PROD_QA_SUPABASE_URL       https://<project-ref>.supabase.co\n" +
        "  PROD_QA_ANON_KEY           the project's anon key\n" +
        "  PROD_QA_SERVICE_ROLE_KEY   the project's service-role key\n\n" +
        "Set them through your approved secret path — never inline on the " +
        "command line, where they land in shell history.",
    );
    return;
  }

  let target;
  try {
    target = assertProdQaTarget({ url, email: PROD_QA_WORKER_EMAIL, anonKey, serviceKey });
  } catch (err) {
    if (err instanceof ProdQaGuardError) return fail(err.message);
    throw err;
  }
  console.info(`\n[gate] ${describeProdQaTarget(target)}`);

  if (revokeOnly) {
    step(1, 1, "revoke the synthetic account");
    run("scripts/prod-qa-provision.ts", ["--i-understand-production", "--revoke"]);
    console.info("\n[gate] Done. The account is banned and its sessions are dead.");
    return;
  }

  // ── 1. provision ────────────────────────────────────────────────────────
  step(1, STEPS, "provision the synthetic QA account (idempotent)");
  run("scripts/prod-qa-provision.ts", ["--i-understand-production"]);

  // ── 2. verify — read it back rather than trusting an exit code ──────────
  step(2, STEPS, "verify the account exists and is synthetic");
  const ok = await verify(target.origin, serviceKey, target.email);
  if (!ok) {
    fail(
      "the account could not be verified after provisioning. The gate will " +
        "NOT run against an unverified identity.",
    );
    return;
  }

  // ── 3. mint ─────────────────────────────────────────────────────────────
  step(3, STEPS, "mint a session (magic-link OTP, no password)");
  run("scripts/prod-qa-mint-session.ts", []);

  // ── 4. gate ─────────────────────────────────────────────────────────────
  step(4, STEPS, `run EMPLOYEE_BETA_PRODUCTION_GATE against ${CANONICAL_ORIGIN}`);
  const gate = spawnSync(
    process.execPath,
    [
      require.resolve("@playwright/test/cli"),
      "test",
      "tests/e2e/employee-beta-gate.spec.ts",
      "--reporter=list",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        E2E_BASE_URL: process.env.E2E_BASE_URL ?? CANONICAL_ORIGIN,
        E2E_NO_SERVER: "1",
      },
    },
  );

  const results = join(
    process.cwd(),
    "..",
    "..",
    "docs",
    "audits",
    "evidence",
    "premium-rebuild",
    "employee-gate",
    "gate-results.json",
  );
  if (gate.status === 0) {
    console.info(`\n[gate] EMPLOYEE_BETA_PRODUCTION_GATE = PASS\n[gate] ${results}`);
  } else {
    console.error(
      `\n[gate] EMPLOYEE_BETA_PRODUCTION_GATE = FAIL (exit ${gate.status}).\n` +
        `[gate] Per-check verdicts: ${results}\n` +
        "[gate] A failing gate is a launch blocker, not a note.",
    );
    process.exitCode = gate.status ?? 1;
  }
}

/** Read the account back through the Admin API. Prints identity facts only. */
async function verify(origin: string, serviceKey: string, email: string): Promise<boolean> {
  const admin = createClient(origin, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`[gate] listUsers failed: ${error.message}`);
      return false;
    }
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").trim().toLowerCase() === email);
    if (hit) {
      const synthetic = (hit.app_metadata as Record<string, unknown> | null)?.qa_synthetic === true;
      console.info(
        `[gate]   id=${hit.id.slice(0, 8)}… confirmed=${Boolean(hit.email_confirmed_at)} ` +
          `qa_synthetic=${synthetic} banned=${Boolean((hit as { banned_until?: string }).banned_until)}`,
      );
      if (!synthetic) {
        console.error(
          "[gate]   REFUSING: this account is not marked qa_synthetic. The gate " +
            "must never run as an identity that was not provisioned for it.",
        );
        return false;
      }
      return true;
    }
    if (users.length < 200) break;
  }
  console.error(`[gate]   not found: ${email}`);
  return false;
}

function run(script: string, args: string[]): void {
  const res = spawnSync(process.execPath, [require.resolve("tsx/cli"), script, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    fail(`${script} exited with ${res.status}. Stopping before the next step.`);
    process.exit(res.status ?? 1);
  }
}

function step(n: number, of: number, what: string): void {
  console.info(`\n[gate] ─ step ${n}/${of} — ${what}`);
}

function fail(message: string): void {
  console.error(`\n[gate] REFUSED\n${message}\n`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[gate] FAILED:", (err as Error).message ?? String(err));
  process.exit(1);
});
