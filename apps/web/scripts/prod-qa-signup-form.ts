/**
 * BEFORE AND AFTER THE SIGN-UP WALK (function register 1.1) — run by
 * `.github/workflows/prod-qa-walk.yml` around
 * `tests/e2e/prod-signup-form.spec.ts`, which signs up ONE account through the
 * real form with the synthetic mailbox address `qa.invited@labourmarket.ai`.
 *
 *   --precheck  stops (exit 1) when an auth user with that address already
 *               exists: the walk must create its own account, and the
 *               clean-up must never delete one the owner provisioned for
 *               another walk. Prints the time; the workflow hands it to
 *               --cleanup as PROD_QA_SIGNUP_NOT_BEFORE.
 *   --cleanup   finds the account. It is deleted ONLY when it was created at
 *               or after PROD_QA_SIGNUP_NOT_BEFORE and carries no owner
 *               provisioning mark. Steps:
 *                 1. mark it `app_metadata.qa_synthetic = true` (so the
 *                    owner's guarded SQL recognises it if step 3 fails);
 *                 2. count the analytics events that name it. Such a row
 *                    blocks the delete and the service role cannot remove it
 *                    (SELECT only on `pilot_events`). The walk refuses
 *                    analytics, so 0 is expected;
 *                 3. delete the auth user through the Admin API. Its profile,
 *                    worker, role and personal engagement rows go by cascade;
 *                 4. the orphan check, with what the service role may read:
 *                    no auth user, profile, worker, role or analytics event
 *                    is left. Anything left fails the job.
 *               When the delete cannot be done the account is BANNED (its
 *               sessions die) and the job fails, naming the owner's SQL:
 *               docs/qa/invited-worker-purge.sql, then
 *               docs/qa/invited-worker-orphans.sql.
 *
 * No grant is widened for this: it uses only what the service role already
 * holds. Refuses every address but the one allowlisted identity and refuses
 * without `--i-understand-production`. Prints origin, address, counts and a
 * short id prefix only — never a key, token or link.
 */
import { appendFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { PROD_QA_INVITED_EMAIL, ProdQaGuardError, assertProdQaTarget, describeProdQaTarget } from "../lib/testing/prod-qa-guard";
import { findAuthUserByEmail } from "../lib/testing/prod-qa-find-user";

const ACK = "--i-understand-production";
const OWNER_SQL = "docs/qa/invited-worker-purge.sql, then docs/qa/invited-worker-orphans.sql";

function fail(message: string): void {
  console.error(`[prod-qa-signup-form] ${message}`);
  process.exitCode = 1;
}

/** Rows of `table` naming the account; null when the read was refused. */
async function count(admin: SupabaseClient, table: string, column: string, value: string): Promise<number | null> {
  const { count: n, error } = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, value);
  return error ? null : (n ?? 0);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const precheck = argv.includes("--precheck");
  const cleanup = argv.includes("--cleanup");
  if (!argv.includes(ACK)) return fail(`refusing to touch production without ${ACK}.`);
  if (precheck === cleanup) return fail("exactly one of --precheck / --cleanup.");

  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail("PROD_QA_SERVICE_ROLE_KEY is not set (approved secret path only).");
  let target;
  try {
    target = assertProdQaTarget({ url: process.env.PROD_QA_SUPABASE_URL, email: PROD_QA_INVITED_EMAIL, serviceKey });
  } catch (err) {
    if (err instanceof ProdQaGuardError) return fail(err.message);
    throw err;
  }
  console.info(`[prod-qa-signup-form] ${describeProdQaTarget(target)}`);
  const admin = createClient(target.origin, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const existing = await findAuthUserByEmail(admin, target.email);

  if (precheck) {
    if (existing) {
      return fail(
        `an account with the synthetic address already exists (id=${existing.id.slice(0, 8)}…). The sign-up walk does not run and nothing was changed. ` +
          `The owner removes it first (${OWNER_SQL}) or finishes the walk that owns it.`,
      );
    }
    const notBefore = new Date(Date.now() - 60_000).toISOString(); // one minute of clock slack
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `not_before=${notBefore}\n`);
    console.info(`[prod-qa-signup-form] PRECHECK OK: no account with the synthetic address (not_before=${notBefore}).`);
    return;
  }

  if (!existing) return console.info("[prod-qa-signup-form] CLEAN: the walk left no account (it did not get as far as creating one).");
  const id = existing.id;
  const short = `${id.slice(0, 8)}…`;
  const notBefore = Date.parse(process.env.PROD_QA_SIGNUP_NOT_BEFORE ?? "");
  const { data: got, error: getError } = await admin.auth.admin.getUserById(id);
  if (getError || !got.user) return fail(`the account could not be read (${getError?.message ?? "no user"}); nothing was changed.`);
  const createdAt = Date.parse(got.user.created_at);
  const mark = (got.user.app_metadata ?? {}) as Record<string, unknown>;
  if (!Number.isFinite(notBefore) || !Number.isFinite(createdAt) || createdAt < notBefore || mark.qa_provisioned_by === "owner") {
    return fail(`the account (id=${short}) was not created by this run; it is NOT deleted. The owner decides (${OWNER_SQL}).`);
  }

  const ban = async (why: string): Promise<void> => {
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    fail(`${why} The account (id=${short}) is ${error ? "NOT banned either" : "banned (sessions are dead)"}. The owner runs ${OWNER_SQL}.`);
  };

  const marked = await admin.auth.admin.updateUserById(id, {
    app_metadata: { qa_synthetic: true, qa_purpose: "labourmarket.ai production E2E — sign-up through the form (register 1.1)", qa_provisioned_by: "signup-form walk" },
  });
  if (marked.error) return ban("The account could not be marked synthetic.");

  const events = await count(admin, "pilot_events", "profile_id", id);
  if (events === null) return ban("The analytics events could not be counted.");
  if (events > 0) return ban(`${events} analytics event(s) name the account; they block the delete and the service role cannot remove them.`);

  const { data: workers } = await admin.from("workers").select("id").eq("profile_id", id);
  const removed = await admin.auth.admin.deleteUser(id);
  if (removed.error) return ban("The Admin API refused to delete the account.");

  const left: string[] = [];
  if (await findAuthUserByEmail(admin, target.email)) left.push("auth user");
  for (const [table, column] of [["profiles", "id"], ["workers", "profile_id"], ["profile_roles", "profile_id"], ["pilot_events", "profile_id"]] as const) {
    const n = await count(admin, table, column, id);
    if (n === null) left.push(`${table} (unreadable)`);
    else if (n > 0) left.push(`${table} (${n})`);
  }
  for (const w of (workers ?? []) as { id: string }[]) {
    const n = await count(admin, "worker_professions", "worker_id", w.id);
    if (n === null) left.push("worker_professions (unreadable)");
    else if (n > 0) left.push(`worker_professions (${n})`);
  }
  if (left.length > 0) return fail(`ORPHANS after the delete: ${left.join(", ")}. The owner runs docs/qa/invited-worker-orphans.sql.`);
  console.info(
    `[prod-qa-signup-form] REMOVED the walk's account (id=${short}): no auth user, profile, worker, role, profession or analytics event is left. ` +
      "Not readable by the service role, removed by the same cascade: engagement_contexts. The auth server keeps its own audit log entries.",
  );
}

void main();
