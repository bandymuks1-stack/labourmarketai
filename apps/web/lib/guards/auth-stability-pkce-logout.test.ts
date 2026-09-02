/**
 * Source-level guards for fix/auth-stability-pkce-logout.
 *
 * Locks the three small auth-only changes in this PR:
 *
 *   1. Logout route uses HTTP 303 (not the Next default 307) — otherwise
 *      a POST from the AccountMenu sign-out form is replayed as POST on
 *      /[locale]/auth/login, which returns 405.
 *   2. Google OAuth callback has a PKCE-race fallback: after an
 *      `exchangeCodeForSession` error, call `getSession`; if a valid
 *      session is present, proceed instead of stranding the user on
 *      `?error=exchange_failed`.
 *   3. The Google login button clears stale local auth state via
 *      `supabase.auth.signOut({ scope: "local" })` BEFORE
 *      `signInWithOAuth`. This evicts a half-revoked refresh token
 *      cookie that would otherwise race the new PKCE code_verifier
 *      write and abort the next /token POST.
 *   4. The server Supabase cookies.setAll catch logs non-secret error
 *      fields instead of silently swallowing every error — so a real
 *      cookie-write failure on the route-handler path doesn't fail
 *      silently.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: logout redirect uses HTTP 303", () => {
  const route = read("app/[locale]/auth/logout/route.ts");

  it("passes { status: 303 } to NextResponse.redirect", () => {
    expect(route).toMatch(
      /NextResponse\.redirect\([\s\S]{0,200}\{\s*status:\s*303\s*\}/,
    );
  });

  it("never uses 307 or 308 explicitly", () => {
    expect(route).not.toMatch(/status:\s*30[78]/);
  });

  it("redirect target is the localized login path", () => {
    expect(route).toMatch(/`\/\$\{locale\}\/auth\/login`/);
  });
});

describe("Guard: callback PKCE-race fallback calls getSession after exchange error", () => {
  const route = read("app/[locale]/auth/callback/route.ts");

  it("captures exchangeCodeForSession's error under a stable name", () => {
    // `code as string` since the token_hash branch (Train A slice 1): the
    // narrowing happens on the `!code && !verification` guard above.
    expect(route).toMatch(/exchangeCodeForSession\(\s*code(?:\s+as\s+string)?\s*\)/);
    expect(route).toMatch(/error:\s*exchangeError/);
  });

  it("inside the exchangeError branch, calls getSession before redirecting", () => {
    expect(route).toMatch(
      /if\s*\(\s*exchangeError\s*\)[\s\S]{0,2000}supabase\.auth\.getSession\(\)/,
    );
  });

  it("only redirects to ?error=exchange_failed when getSession has NO session", () => {
    // The outcome is produced by the pure classifier (Train A slice 1): it
    // returns `exchange_failed` for everything except a verifier-missing
    // failure on the e-mail-confirmation flow, which is `confirmed_sign_in`.
    expect(route).toMatch(
      /if\s*\(\s*!\s*sessionData\??\.\??session\s*\)\s*\{[\s\S]{0,700}classifyExchangeFailure\(\s*exchangeError/,
    );
    const classifier = read("lib/auth/email-confirm.ts");
    expect(classifier).toMatch(/if\s*\(\s*!emailConfirmFlow\s*\|\|\s*!error\s*\)\s*return\s*["']exchange_failed["']/);
  });
});

describe("Guard: Google button clears local auth state before signInWithOAuth", () => {
  const btn = read("components/app/google-button.tsx");

  it("calls supabase.auth.signOut with scope: 'local' before signInWithOAuth", () => {
    // signOut must precede signInWithOAuth in the source. We assert that
    // by matching the two calls in order with no other signInWithOAuth
    // between them.
    expect(btn).toMatch(
      /signOut\(\s*\{\s*scope:\s*["']local["']\s*\}\s*\)[\s\S]+signInWithOAuth\(/,
    );
  });

  it("does NOT pass scope: 'global' / 'others' (no remote-session revoke)", () => {
    // A global revoke before OAuth would kill the user's other devices
    // and would be observable in Supabase auth logs as an extra
    // /logout call. Forbidden by spec.
    expect(btn).not.toMatch(/scope:\s*["'](global|others)["']/);
  });

  it("signOut errors are swallowed (no UX block on missing local session)", () => {
    expect(btn).toMatch(
      /signOut\([\s\S]{0,80}\)\s*;?[\s\S]{0,80}catch\s*[\{(]/,
    );
  });
});

describe("Guard: server supabase cookies.setAll logs (no silent swallow)", () => {
  const server = read("lib/supabase/server.ts");

  it("catch arm calls console.error with the suppressed error", () => {
    expect(server).toMatch(
      /catch\s*\(\s*e\s*\)\s*\{[\s\S]{0,2000}console\.error\([\s\S]{0,500}cookies\.setAll/,
    );
  });

  it("never logs cookie names, values, or the cookiesToSet array", () => {
    // Anywhere inside server.ts the catch must not stringify cookies.
    expect(server).not.toMatch(
      /console\.(?:error|warn|log)\([^)]{0,300}cookiesToSet/,
    );
    expect(server).not.toMatch(
      /console\.(?:error|warn|log)\([^)]{0,300}cookieStore\.getAll/,
    );
  });
});
