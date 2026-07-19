import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * First-party Google auth guard (Phase 2 of the single-domain task).
 *
 * Locks the architecture of the GIS ID-token flow:
 *   1. the browser POSTs the credential ONLY to the same-origin
 *      /api/auth/google endpoint;
 *   2. no user-visible browser NAVIGATION through *.supabase.co is
 *      introduced — `signInWithOAuth` (which navigates via the raw
 *      Supabase authorize URL) survives ONLY as the config-gated legacy
 *      fallback inside google-button.tsx until Phase 3 removes it;
 *   3. the endpoint and button never log the credential / tokens;
 *   4. the endpoint enforces Origin, rate limit, and nonce.
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

const ROUTE = "app/api/auth/google/route.ts";
const BUTTON = "components/app/google-button.tsx";

describe("first-party google auth — endpoint architecture", () => {
  const route = read(ROUTE);

  it("validates Origin, rate limit, claims and nonce", () => {
    expect(route).toMatch(/isAllowedAuthOrigin/);
    expect(route).toMatch(/isRateLimited/);
    expect(route).toMatch(/validateGoogleIdTokenClaims/);
    expect(route).toMatch(/nonce:\s*body\.nonce/);
  });

  it("exchanges via the cookie-bound SSR client (same identity system)", () => {
    expect(route).toMatch(/@\/lib\/supabase\/server/);
    expect(route).toMatch(/signInWithIdToken/);
    // No admin/service-role client — the exchange must go through the
    // normal auth path so RLS and user identity are untouched.
    expect(route).not.toMatch(/supabase\/admin|SERVICE_ROLE/);
  });

  it("sends the token to Google via POST body, never a query string", () => {
    expect(route).toMatch(/method:\s*"POST"/);
    expect(route).not.toMatch(/tokeninfo\?/);
  });

  it("never logs the credential or tokens", () => {
    for (const line of route.split("\n")) {
      if (!/console\.(log|info|warn|error)/.test(line)) continue;
      expect(line, `log line leaks sensitive value: ${line.trim()}`).not.toMatch(
        /credential|id_token|access_token|refresh_token|cookie/i,
      );
    }
  });

  it("sanitises the next path before returning it", () => {
    expect(route).toMatch(/getSafeReturnPath/);
  });
});

describe("first-party google auth — browser side", () => {
  const button = read(BUTTON);

  it("POSTs the credential only to the same-origin endpoint", () => {
    expect(button).toMatch(/fetch\(\s*`\/api\/auth\/google/);
    // Never to an absolute third-party URL.
    expect(button).not.toMatch(/fetch\(\s*["'`]https?:\/\//);
  });

  it("passes a per-attempt nonce to BOTH Google and the endpoint", () => {
    expect(button).toMatch(/nonce:\s*nonceRef\.current/);
    expect(button).toMatch(/nonce:\s*nonceRef\.current,\s*\n\s*ux_mode/);
  });

  it("loads GIS from accounts.google.com only", () => {
    expect(button).toMatch(
      /const GSI_SRC = "https:\/\/accounts\.google\.com\/gsi\/client"/,
    );
  });

  it("is honestly absent (renders null) when the client id is unset", () => {
    // No dead button, no legacy fallback — Phase 3 removed the
    // Supabase-hosted redirect flow entirely.
    expect(button).toMatch(/if \(!GOOGLE_CLIENT_ID\) return null;/);
  });
});

describe("regression — no visible browser OAuth navigation via *.supabase.co", () => {
  const walk = (dir: string, out: string[], pattern: RegExp) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(full, out, pattern);
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
        if (pattern.test(readFileSync(full, "utf8"))) out.push(full);
      }
    }
  };

  it("signInWithOAuth (Supabase-hosted redirect flow) is gone repo-wide", () => {
    // The redirect flow navigates the browser through
    // <ref>.supabase.co/auth/v1/authorize — banned under the
    // single-domain policy. Google sign-in goes through
    // signInWithIdToken on the server only.
    const offenders: string[] = [];
    for (const d of ["app", "components", "lib"]) {
      walk(join(WEB_ROOT, d), offenders, /signInWithOAuth/);
    }
    expect(offenders).toEqual([]);
  });

  it("no client component navigates to a supabase.co URL", () => {
    // components/ is the browser-navigation surface; the only allowed
    // supabase.co contact is XHR via supabase-js (which reads the env
    // URL, never a literal).
    const offenders: string[] = [];
    walk(join(WEB_ROOT, "components"), offenders, /supabase\.co/);
    expect(offenders).toEqual([]);
  });
});
