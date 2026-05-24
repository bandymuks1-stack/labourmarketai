/**
 * Local-only helper: mint a real Supabase session for the owner's
 * existing user via the Admin API, then write Playwright storageState
 * with the session cookies in the `@supabase/ssr` format. Used by the
 * profile-text-skills-smoke e2e to drive a credentialed browser without
 * needing Google OAuth.
 *
 * NOT a production script. NOT a build step. Run on demand:
 *
 *   E2E_OWNER_EMAIL=sukysdonatas@gmail.com \
 *     pnpm tsx scripts/e2e-mint-session.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 * Writes: tests/e2e/.storage-state.json (gitignored).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

async function main(): Promise<void> {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_OWNER_EMAIL;
  if (!url || !anonKey || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (!email) {
    throw new Error("Set E2E_OWNER_EMAIL=<user@…> before running");
  }

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
  console.error("[e2e-mint] FAILED:", (err as Error).message);
  process.exit(1);
});
