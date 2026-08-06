/**
 * Mint a Playwright session for the ONE synthetic production QA account.
 *
 * Local/CI only. This is a script, not an endpoint — nothing in the app
 * imports it, there is no route and no server action that can reach it, so
 * there is no "general production session-mint" surface anywhere. It can only
 * ever act for `qa.worker+goal3@labourmarket.ai`; `lib/testing/prod-qa-guard.ts`
 * refuses every other identity, and widening that allowlist is a code change in
 * a reviewable diff.
 *
 *   PROD_QA_SUPABASE_URL=https://<ref>.supabase.co \
 *   PROD_QA_ANON_KEY=<anon key> \
 *   PROD_QA_SERVICE_ROLE_KEY=<service-role key> \
 *   pnpm -C apps/web exec tsx scripts/prod-qa-mint-session.ts
 *
 * Writes `tests/e2e/.storage-state.prod-qa.json` — GITIGNORED, and it holds a
 * real session token, so it must never be committed, attached to a report or
 * included in a trace that leaves the machine.
 *
 * NO PASSWORD IS INVOLVED. The account is passwordless; this uses the same
 * magic-link OTP path `e2e-mint-session.ts` uses locally, so no credential for
 * this identity exists to be typed, stored or leaked.
 *
 * WHY NOT EXTEND `e2e-mint-session.ts`. That script is fail-closed to the LOCAL
 * stack, and that guard is load-bearing — it is what stops a stray env var from
 * minting a session against the cloud. Adding a production mode to it would
 * turn an absolute refusal into a conditional one. Two narrow scripts that each
 * refuse everything outside their one job cannot be collapsed into that mistake
 * by an innocent-looking edit.
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { CANONICAL_HOST } from "../lib/domain/canonical";
import {
  PROD_QA_MANAGER_EMAIL,
  PROD_QA_OWNER_EMAIL,
  PROD_QA_WORKER_EMAIL,
  ProdQaGuardError,
  assertProdQaTarget,
  describeProdQaTarget,
} from "../lib/testing/prod-qa-guard";

/** `--identity` handle → allowlisted address (never an email on the CLI). */
const IDENTITY_EMAILS = {
  owner: PROD_QA_OWNER_EMAIL,
  manager: PROD_QA_MANAGER_EMAIL,
  worker: PROD_QA_WORKER_EMAIL,
} as const;
type IdentityHandle = keyof typeof IDENTITY_EMAILS;

function parseIdentity(argv: readonly string[]): IdentityHandle | null {
  const arg = argv.find((a) => a.startsWith("--identity="));
  const v = arg?.slice("--identity=".length) ?? "";
  return v === "owner" || v === "manager" || v === "worker" ? v : null;
}

/** Per-identity state file — all matched by the `.storage-state.prod-qa.*`
 *  gitignore family. */
const outFor = (handle: IdentityHandle): string =>
  join(process.cwd(), "tests", "e2e", `.storage-state.prod-qa.${handle}.json`);

/**
 * The host the session cookie is scoped to — the CANONICAL apex.
 *
 * Deliberately NOT the legacy `app.` host: `lib/domain/canonical.ts` classifies
 * it as `LEGACY_APP_HOST` and `next.config.ts` permanently redirects it to the
 * apex. Scoping a cookie to a host that 301s would mint a session the browser
 * drops on the first hop.
 */
const APP_HOST = process.env.PROD_QA_APP_HOST ?? CANONICAL_HOST;

async function main(): Promise<void> {
  const url = process.env.PROD_QA_SUPABASE_URL;
  const anonKey = process.env.PROD_QA_ANON_KEY;
  const serviceKey = process.env.PROD_QA_SERVICE_ROLE_KEY;

  const handle = parseIdentity(process.argv.slice(2));
  if (!handle) {
    fail(
      "pass --identity=owner | --identity=manager | --identity=worker.\n" +
        "The selector maps only to the three code-reviewed synthetic addresses.",
    );
    return;
  }
  const OUT = outFor(handle);

  if (!anonKey || !serviceKey) {
    fail(
      "PROD_QA_ANON_KEY and PROD_QA_SERVICE_ROLE_KEY must both be set, through " +
        "your approved secret/environment path.",
    );
    return;
  }

  let target;
  try {
    target = assertProdQaTarget({
      url,
      email: IDENTITY_EMAILS[handle],
      anonKey,
      serviceKey,
    });
  } catch (err) {
    if (err instanceof ProdQaGuardError) {
      fail(err.message);
      return;
    }
    throw err;
  }

  console.info(`[prod-qa-mint] ${describeProdQaTarget(target)}`);

  const admin = createClient(target.origin, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  if (linkErr || !link?.properties?.email_otp) {
    fail(
      `generateLink failed: ${linkErr?.message ?? "no email_otp"}. ` +
        "Has the account been provisioned (scripts/prod-qa-provision.ts)?",
    );
    return;
  }

  const anon = createClient(target.origin, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    email: target.email,
    token: link.properties.email_otp,
    type: "magiclink",
  });
  if (vErr || !sess?.session) {
    fail(`verifyOtp failed: ${vErr?.message ?? "no session"}`);
    return;
  }

  // @supabase/ssr stores the session as `sb-<ref>-auth-token`, value
  // `base64-` + base64url(JSON). Same formula as the local mint — the cookie
  // NAME comes from the Supabase host, the DOMAIN from the app host.
  const cookieName = `sb-${new URL(target.origin).host.split(".")[0]}-auth-token`;
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(sess.session))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const MAX = 3180;
  const base = {
    domain: APP_HOST,
    path: "/",
    expires: Math.floor(Date.now() / 1000) + 60 * 60,
    httpOnly: false,
    secure: true,
    sameSite: "Lax" as const,
  };
  const cookies =
    encodeURIComponent(value).length <= MAX
      ? [{ name: cookieName, value, ...base }]
      : chunk(value, 3000).map((part, i) => ({
          name: `${cookieName}.${i}`,
          value: part,
          ...base,
        }));

  writeFileSync(OUT, JSON.stringify({ cookies, origins: [] }, null, 2));

  // Metadata only — never the token.
  const user = sess.session.user;
  console.info(
    `[prod-qa-mint] minted for ${user.email} ` +
      `(id=${user.id.slice(0, 8)}…), ${cookies.length} cookie(s) → ${OUT}`,
  );
  console.info(
    "[prod-qa-mint] this file holds a REAL session. It is gitignored; do not " +
      "commit it, attach it to a report, or ship it inside a trace.",
  );
}

function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

function fail(message: string): void {
  console.error(`\n[prod-qa-mint] REFUSED\n${message}\n`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("[prod-qa-mint] FAILED:", (err as Error).message ?? String(err));
  process.exit(1);
});
