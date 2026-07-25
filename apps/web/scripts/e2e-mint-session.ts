/**
 * Local-only helper: mint a real Supabase session for a LOCAL fixture user via
 * the Admin API, then write Playwright storageState with the session cookies in
 * the `@supabase/ssr` format. Lets the authenticated e2e specs drive a
 * credentialed browser without Google OAuth.
 *
 * FAIL-CLOSED. This script previously read `apps/web/.env.local`, which points
 * at the PRODUCTION project and carries a real service-role key — so running it
 * as documented would have minted a session for a real user in production. It
 * now refuses to touch anything that is not demonstrably the local stack:
 *   * it never reads `.env.local`;
 *   * the target comes from `E2E_SUPABASE_*` or `npx supabase status` only;
 *   * `assertLocalSupabaseTarget` rejects non-loopback hosts, `supabase.co`,
 *     the production project ref, any non-allowlisted origin, and any Supabase
 *     Cloud key — refusing with REFUSED_NON_LOCAL_E2E_SESSION_MINT;
 *   * it additionally probes `<url>/auth/v1/health` so the Admin API call can
 *     only reach a GoTrue that is actually running locally;
 *   * it never prints a key.
 *
 * It cannot create or modify a cloud user.
 *
 * NOT a production script. NOT a build step. Run on demand:
 *
 *   E2E_OWNER_EMAIL=dev.worker@local.test pnpm tsx scripts/e2e-mint-session.ts
 *
 * Writes: tests/e2e/.storage-state.json (gitignored).
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  NonLocalTargetError,
  REFUSAL_CODE,
} from "../lib/testing/local-supabase-guard";
import {
  describeLocalTarget,
  resolveLocalSupabaseEnv,
} from "../lib/testing/local-supabase-env";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * Confirm a LOCAL GoTrue is actually answering before we call the Admin API.
 * The origin is already allowlisted; this proves something local is listening
 * rather than the request silently going somewhere else.
 */
async function assertLocalGoTrue(url: string, anonKey: string): Promise<void> {
  const health = `${url.replace(/\/$/, "")}/auth/v1/health`;
  let res: Response;
  try {
    res = await fetch(health, { headers: { apikey: anonKey } });
  } catch (err) {
    throw new NonLocalTargetError(
      `local GoTrue is not reachable at ${health} ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        "Start the stack with `npx supabase start`.",
    );
  }
  if (!res.ok) {
    throw new NonLocalTargetError(
      `local GoTrue health check at ${health} returned ${res.status}.`,
    );
  }
}

async function main(): Promise<void> {
  const local = resolveLocalSupabaseEnv(REPO_ROOT);
  const { url, anonKey, serviceKey } = local;
  // Host + project ref only — never a key.
  console.log(`[e2e-mint] ${describeLocalTarget(local)}`);

  await assertLocalGoTrue(url, anonKey);

  const email = process.env.E2E_OWNER_EMAIL;
  if (!email) {
    throw new Error(
      "Set E2E_OWNER_EMAIL=<user@…> before running (use a LOCAL fixture user, " +
        "e.g. dev.worker@local.test — never a production account)",
    );
  }

  // The cookie name must match what `@supabase/ssr` derives IN THE BROWSER, so
  // keep this formula byte-identical to the original: `new URL(url).host` keeps
  // the port, so `http://127.0.0.1:54321` yields `127` and the cookie is
  // `sb-127-auth-token`. Do NOT substitute the guard's `target.projectRef` —
  // that value is for logging only and would produce a different name.
  const projectRef = new URL(url).host.split(".")[0];

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Generate a magic-link OTP. Returns properties.email_otp (6-digit) +
  // properties.hashed_token + properties.action_link. We use email_otp
  // to call verifyOtp directly — no email is sent.
  const { data: link, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkErr || !link?.properties?.email_otp) {
    throw new Error(
      `admin.generateLink failed: ${linkErr?.message ?? "no email_otp"}`,
    );
  }

  // Verify the OTP via the anon client to get back a real session
  // (access_token + refresh_token) just like the real magic-link flow
  // would, without the redirect-and-hash dance.
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: "magiclink",
  });
  if (vErr || !sess?.session) {
    throw new Error(`verifyOtp failed: ${vErr?.message ?? "no session"}`);
  }

  const session = sess.session;

  // @supabase/ssr v0.5+ stores the auth session as `sb-<ref>-auth-token`
  // cookies whose VALUE is `base64-` + base64url(JSON.stringify(session)).
  // `session` is the WHOLE session object from auth-js (access_token,
  // refresh_token, expires_at, expires_in, token_type, user) — NOT the
  // historical [at, rt, pt, prt, user] array. See cookies.js header:
  //   "the underlying payload is always JSON encoded by auth-js"
  // The chunker in @supabase/ssr/utils/chunker.js chunks against
  // encodeURIComponent(value).length with MAX_CHUNK_SIZE=3180. Below
  // that threshold a single cookie name is used.
  const cookieJson = JSON.stringify(session);
  const base64url = Buffer.from(cookieJson)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const cookieValue = `base64-${base64url}`;
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieDomain = "127.0.0.1";

  const cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
  }[] = [];

  // Match the @supabase/ssr chunker rule: single cookie when
  // encodeURIComponent(value).length <= MAX_CHUNK_SIZE (3180); otherwise
  // chunk into `sb-<ref>-auth-token.0`, `.1`, … with each chunk's encoded
  // length <= MAX_CHUNK_SIZE. We use 3000 as the safe per-chunk cap for
  // the raw value to leave headroom against URL-encoding expansion.
  const MAX_ENCODED = 3180;
  if (encodeURIComponent(cookieValue).length <= MAX_ENCODED) {
    cookies.push({
      name: cookieName,
      value: cookieValue,
      domain: cookieDomain,
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    });
  } else {
    const CHUNK = 3000;
    let i = 0;
    for (let pos = 0; pos < cookieValue.length; pos += CHUNK) {
      cookies.push({
        name: `${cookieName}.${i}`,
        value: cookieValue.slice(pos, pos + CHUNK),
        domain: cookieDomain,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 60 * 60,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      });
      i++;
    }
  }

  const storageState = { cookies, origins: [] };
  const out = join(process.cwd(), "tests", "e2e", ".storage-state.json");
  writeFileSync(out, JSON.stringify(storageState, null, 2));

  // Print only metadata, never the tokens themselves.
  console.log(
    `[e2e-mint] minted session for ${session.user.email} (id=${session.user.id.slice(0, 8)}…), ` +
      `wrote storageState with ${cookies.length} cookie(s) to ${out}`,
  );
}

main().catch((err) => {
  const message = (err as Error).message ?? String(err);
  if (err instanceof NonLocalTargetError) {
    // The refusal code is the grep-able contract for this failure mode.
    console.error(`[e2e-mint] ${message}`);
    console.error(
      `[e2e-mint] ${REFUSAL_CODE} — no session was minted and no user was ` +
        "created or modified.",
    );
    process.exit(1);
  }
  console.error("[e2e-mint] FAILED:", message);
  process.exit(1);
});
