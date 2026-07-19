/**
 * Source-level guards for fix/google-oauth-stability-and-diagnostics.
 *
 * Production Google login was already healthy at the Supabase auth layer
 * when this PR was written (verified 2026-05-25 against
 * `/auth/v1/settings` logs: zero `redirect_uri_mismatch`, zero
 * `exchange_failed`, every PKCE login a clean 200/302). This PR adds the
 * observability + UX framing needed so the NEXT failure — wherever it
 * lands — is debuggable from a single trace id, and so testers landing on
 * a preview deployment are honestly told why Google login can't be
 * exercised there.
 *
 * These guards encode the contract so future edits can't silently strip:
 *   - Trace ids are NEVER derived from the auth code, tokens, or cookies.
 *   - Log lines NEVER include the auth code / cookie value / full URL.
 *   - The Google button generates a trace id, attaches it, and logs the
 *     `oauth start` line before redirecting to Google.
 *   - The callback reads the trace id off the URL and includes it in
 *     every log line.
 *   - The login page surfaces ?error= + ?trace= so the user sees a
 *     precise reason and can quote the trace id.
 *   - Preview hosts get an informational notice.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

/** Extract every `console.X(...)` call in the source — payload-aware so a
 *  matching `)` inside the argument list (a regex pattern, a string with
 *  `)` in it, a nested function call) doesn't terminate the capture early.
 *  Returns the inner arguments (between the outer `(` and matching `)`).
 *  Greedy on payload size, conservative on patterns we don't expect. */
function consoleCalls(src: string): string[] {
  const out: string[] = [];
  const startRe = /console\.(?:info|warn|error|log|debug)\(/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      const prev = src[i - 1];
      if (!inDouble && !inTemplate && ch === "'" && prev !== "\\") inSingle = !inSingle;
      else if (!inSingle && !inTemplate && ch === '"' && prev !== "\\") inDouble = !inDouble;
      else if (!inSingle && !inDouble && ch === "`" && prev !== "\\") inTemplate = !inTemplate;
      else if (!inSingle && !inDouble && !inTemplate) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      i++;
    }
    out.push(src.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

describe("Guard: oauth-trace helpers stay free of any auth-code derivation", () => {
  const src = read("lib/auth/oauth-trace.ts");

  it("uses crypto.getRandomValues (or Math.random fallback) — not derived from any input", () => {
    expect(src).toMatch(/crypto\.getRandomValues/);
    // The function takes no parameter, so it cannot accidentally hash an
    // auth code or cookie value.
    expect(src).toMatch(/export function generateOauthTraceId\(\)/);
  });

  it("does not import or reference auth codes / cookies / tokens", () => {
    expect(src).not.toMatch(/getCookie|setCookie|document\.cookie|exchangeCodeForSession/);
    expect(src).not.toMatch(/access_token|refresh_token|id_token/i);
  });
});

describe("Guard: GoogleButton observability + safe logging", () => {
  const btn = read("components/app/google-button.tsx");

  it("derives the per-attempt nonce from the crypto-random trace helper", () => {
    // GIS flow: the nonce is the anti-replay anchor (embedded into the
    // Google ID token + re-checked server-side). It must come from the
    // crypto-random helper, never from user input or the URL.
    expect(btn).toMatch(/generateOauthTraceId\(\)\s*\+\s*generateOauthTraceId\(\)/);
  });

  it("records start/success/error telemetry for the first-party flow", () => {
    expect(btn).toMatch(/google_id_token_start/);
    expect(btn).toMatch(/google_id_token_success/);
    expect(btn).toMatch(/google_id_token_error/);
  });

  it("logs only name + message of a sign-in failure (never the full Error object)", () => {
    // The console.error must extract `.name` and `.message` explicitly so
    // a future Error subclass with sensitive `cause` data doesn't leak.
    expect(btn).toMatch(
      /console\.error\(\s*["']\[auth\] first-party google sign-in failed:["'][\s\S]{0,400}name:\s*e\s+instanceof\s+Error/,
    );
  });

  it("never logs auth tokens, cookies, or full URL (forbids value-substitution inside any console.X)", () => {
    // Scope the check to the argument list of each console.X(...) call.
    // The literal English word "code" inside a log MESSAGE string is
    // fine; what we forbid is logging the auth-code VARIABLE's value or
    // any JWT / cookie / full-URL value.
    const FORBIDDEN = [
      /\$\{code\}/,
      /[,{]\s*code\s*[},]/,
      /\baccess_token\b/,
      /\brefresh_token\b/,
      /\bid_token\b/,
      /\brequest\.url\b/,
      /document\.cookie/,
    ];
    for (const call of consoleCalls(btn)) {
      for (const re of FORBIDDEN) {
        expect(call, `forbidden pattern ${re} in console call: ${call.slice(0, 200)}`).not.toMatch(re);
      }
    }
  });
});

describe("Guard: callback route includes trace id + safe logging", () => {
  const route = read("app/[locale]/auth/callback/route.ts");

  it("reads the trace id off the URL via readOauthTraceId", () => {
    expect(route).toMatch(/readOauthTraceId\(\s*url\s*\)/);
  });

  it("forwards the trace id to /login on failure", () => {
    expect(route).toMatch(
      /loginUrl\.searchParams\.set\(\s*["']trace["']\s*,\s*traceId\s*\)/,
    );
  });

  it("includes `trace: traceId` in every console.error from the callback", () => {
    // Pull all console.error / console.warn calls in the file. Each one
    // emitted inside the exchange path must carry the trace id. The
    // missing_code path also includes it.
    const lines = route.split("\n");
    const violations: string[] = [];
    let inLog = false;
    let buf = "";
    for (const line of lines) {
      if (/console\.(?:error|warn|info)\(/.test(line) && !inLog) {
        inLog = true;
        buf = line;
      } else if (inLog) {
        buf += "\n" + line;
      }
      if (inLog && line.includes(");")) {
        // Some lines under callback do NOT relate to a trace (e.g. the
        // server-side cookies suppression in lib/supabase/server.ts is
        // a different file). Here in the callback route, every log
        // must include `trace`.
        if (!/trace/.test(buf)) violations.push(buf.slice(0, 200));
        inLog = false;
        buf = "";
      }
    }
    expect(violations).toEqual([]);
  });

  it("never logs auth tokens, cookies, or the raw request URL inside any console.X", () => {
    // `code: exchangeError.code` (a non-secret SDK error tag) is allowed
    // because the value side is `exchangeError.code`, NOT the local auth
    // `code` variable. We forbid value-substitution patterns only.
    const FORBIDDEN = [
      /\$\{code\}/,
      /[,{]\s*code\s*[},]/,
      /\baccess_token\b/,
      /\brefresh_token\b/,
      /\bid_token\b/,
      /\brequest\.url\b/,
      /document\.cookie/,
    ];
    for (const call of consoleCalls(route)) {
      for (const re of FORBIDDEN) {
        expect(call, `forbidden pattern ${re} in console call: ${call.slice(0, 200)}`).not.toMatch(re);
      }
    }
  });
});

describe("Guard: login form surfaces ?error + ?trace and preview notice", () => {
  const form = read("components/app/login-form.tsx");

  it("reads ?error and ?trace off searchParams", () => {
    expect(form).toMatch(/searchParams\.get\(\s*["']error["']\s*\)/);
    expect(form).toMatch(/searchParams\.get\(\s*["']trace["']\s*\)/);
  });

  it("maps each callback error code to a translation key under auth.errors.oauth.*", () => {
    expect(form).toMatch(/OAUTH_ERROR_KEYS/);
    for (const code of [
      "missing_code",
      "exchange_failed",
      "no_user",
      "callback",
    ]) {
      expect(form).toMatch(new RegExp(`${code}:\\s*["']oauth\\.${code}["']`));
    }
  });

  it("renders the trace id as a font-mono label below the error", () => {
    expect(form).toMatch(/trace:\s*\{oauthTrace\}/);
  });

  it("renders an informational preview-host notice (does NOT disable the Google button)", () => {
    expect(form).toMatch(/isVercelPreviewHost\(/);
    expect(form).toMatch(/preview_host_notice/);
    // The GoogleButton must still render even when isPreviewHost is true.
    // Asserted by the absence of `{!isPreviewHost && <GoogleButton`.
    expect(form).not.toMatch(/!\s*isPreviewHost\s*&&\s*<GoogleButton/);
  });
});

describe("Guard: LT + EN auth.errors.oauth + auth.login.preview_host_notice present", () => {
  const lt = JSON.parse(read("messages/lt.json"));
  const en = JSON.parse(read("messages/en.json"));

  it("LT exposes oauth.* error keys", () => {
    for (const k of ["missing_code", "exchange_failed", "no_user", "callback", "unknown"]) {
      expect(lt.auth?.errors?.oauth?.[k]).toBeTruthy();
    }
  });

  it("EN exposes oauth.* error keys", () => {
    for (const k of ["missing_code", "exchange_failed", "no_user", "callback", "unknown"]) {
      expect(en.auth?.errors?.oauth?.[k]).toBeTruthy();
    }
  });

  it("LT + EN expose auth.login.preview_host_notice (mentioning the production URL)", () => {
    expect(lt.auth?.login?.preview_host_notice).toMatch(/labourmarket\.ai/);
    expect(en.auth?.login?.preview_host_notice).toMatch(/labourmarket\.ai/);
  });
});
