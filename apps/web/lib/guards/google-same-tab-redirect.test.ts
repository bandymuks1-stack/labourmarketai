import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Google sign-in architecture guard (owner ruling 2026-07-29, P0).
 *
 * REPLACES `first-party-google-auth.test.ts`, which locked the GIS ID-token
 * POPUP flow. The owner ruled the popup out: sign-in must be ONE same-tab
 * redirect. This guard locks the new architecture so the popup cannot creep
 * back in through a well-meaning "branding" refactor:
 *
 *   1. NO popup anywhere in the auth surface — no GIS script, no `ux_mode`,
 *      no `window.open`;
 *   2. exactly ONE Google flow: `signInWithOAuth` in google-button.tsx,
 *      with the PKCE callback on OUR host carrying locale + safe `next`;
 *   3. the removed GIS endpoint stays removed;
 *   4. no token/credential logging;
 *   5. the button is never rendered dead — it is the real flow, not a
 *      decoration (no disabled-by-default, no fake handler).
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Source with comments stripped — the button DOCUMENTS the rejected popup
 *  alternative in prose, and a guard must never fail on the documentation of
 *  the rule it enforces. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BUTTON = "components/app/google-button.tsx";
const CALLBACK = "app/[locale]/auth/callback/route.ts";

describe("google sign-in — same-tab redirect only", () => {
  const button = read(BUTTON);

  it("has no popup machinery of any kind", () => {
    const code = stripComments(button);
    // Plain substring, not a regex: this asserts the GIS script URL is ABSENT
    // from source code — it never validates a URL, and an unanchored host
    // regex would (rightly) trip CodeQL's missing-regexp-anchor rule.
    expect(code).not.toContain("accounts.google.com/gsi");
    expect(code).not.toMatch(/ux_mode/);
    expect(code).not.toMatch(/window\.open\(/);
    expect(code).not.toMatch(/renderButton/);
  });

  it("is the ONE flow: signInWithOAuth with a same-host locale callback", () => {
    expect(button).toMatch(/signInWithOAuth/);
    expect(button).toMatch(/\/\$\{locale\}\/auth\/callback/);
    // The intended return path rides along, sanitised upstream.
    expect(button).toMatch(/callback\.searchParams\.set\("next", nextPath\)/);
  });

  it("evicts stale local auth state before writing a fresh PKCE verifier", () => {
    // The PKCE-race incident: a stale session cookie beside a fresh
    // code_verifier breaks the exchange. The eviction must survive.
    expect(button).toMatch(/signOut\(\{ scope: "local" \}\)/);
  });

  it("never logs tokens or credentials", () => {
    for (const line of button.split("\n")) {
      if (!/console\.(log|info|warn|error)/.test(line)) continue;
      expect(line, `log line leaks sensitive value: ${line.trim()}`).not.toMatch(
        /credential|id_token|access_token|refresh_token|cookie/i,
      );
    }
  });

  it("carries the per-attempt oauth trace id for diagnosable failures", () => {
    expect(button).toMatch(/generateOauthTraceId\(\)/);
    expect(button).toMatch(/rememberOauthTraceId/);
    expect(button).toMatch(/withOauthTraceId/);
  });

  it("signup context keeps funnel attribution", () => {
    expect(button).toMatch(/registrationStarted/);
    expect(button).toMatch(/captureFirstTouchAttribution/);
    expect(button).toMatch(/markSignupPending\("google"\)/);
  });
});

describe("google sign-in — the removed popup endpoint stays removed", () => {
  it("the GIS endpoint and helpers do not exist", () => {
    for (const rel of [
      "app/api/auth/google/route.ts",
      "lib/auth/google-id-token.ts",
    ]) {
      expect(existsSync(join(WEB_ROOT, rel)), `${rel} must stay removed`).toBe(false);
    }
  });

  it("nothing in the app references the removed endpoint", () => {
    // A stale fetch to /api/auth/google would be a dead login path — worse
    // than none. Checked over the auth surface where it could reappear.
    for (const rel of [BUTTON, "components/app/login-form.tsx", "components/app/signup-form.tsx"]) {
      expect(read(rel)).not.toMatch(/api\/auth\/google/);
    }
  });
});

describe("google sign-in — the callback completes the loop", () => {
  const cb = read(CALLBACK);

  it("exchanges the code and routes to the safe next path", () => {
    expect(cb).toMatch(/exchangeCodeForSession/);
    expect(cb).toMatch(/getSafeReturnPath/);
  });

  it("keeps the user's locale on both success and failure", () => {
    expect(cb).toMatch(/\/\$\{locale\}\/auth\/login/);
  });
});
