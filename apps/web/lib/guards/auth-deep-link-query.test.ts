import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard for W7 slice 3 — auth deep-link query preservation.
 *
 * The W7 audit found `middleware.ts` built the `next` param from `pathname`
 * ALONE, so a logged-out visitor on
 *
 *   /en/dashboard?result=experiences&interaction=<kind>:<uuid>
 *
 * could only be returned to `/en/dashboard` — losing the result, the depth and
 * the entry point they had actually clicked. A second, quieter defect sat
 * beside it: `request.nextUrl.clone()` copies the ORIGINAL query onto the login
 * URL, so those params were not merely dropped, they were smeared onto
 * `/auth/login` where nothing reads them and a token-shaped one would sit in
 * request logs.
 *
 * This guard pins the shape of the fix so a later edit cannot silently:
 *   - go back to `pathname`-only (the regression this slice exists to prevent),
 *   - leave the cloned query on the login URL,
 *   - bypass the shared sanitiser and hand-roll a `next`, or
 *   - drop the credential denylist / caps that keep tokens out of logs.
 *
 * Behaviour itself is proven by unit tests in `lib/auth/redirect.test.ts`
 * (29 cases incl. the backslash, percent-encoding and header-injection
 * bypasses) — this file guards the WIRING, which a unit test cannot see.
 */

const APP = resolve(__dirname, "..", "..");
function readApp(rel: string): string {
  return readFileSync(resolve(APP, rel), "utf8");
}

const middleware = readApp("middleware.ts");
const redirect = readApp("lib/auth/redirect.ts");

describe("W7 slice 3 — the middleware preserves the deep link", () => {
  it("builds `next` through the shared sanitiser, not by hand", () => {
    expect(middleware).toContain(
      'import { buildReturnValue } from "@/lib/auth/redirect"',
    );
    expect(middleware).toMatch(/buildReturnValue\(\s*request\.nextUrl\.pathname,/);
    expect(middleware).toMatch(/request\.nextUrl\.search,/);
  });

  it("never sets `next` from pathname alone again", () => {
    // The exact defect: `next` = pathname, query discarded.
    expect(middleware).not.toMatch(
      /searchParams\.set\(\s*"next"\s*,\s*request\.nextUrl\.pathname\s*\)/,
    );
  });

  it("clears the cloned query so login carries only `next`", () => {
    const block = middleware.slice(
      middleware.indexOf("if (!user) {"),
      middleware.indexOf("NextResponse.redirect(loginUrl)"),
    );
    expect(block).toContain("loginUrl.searchParams.delete(key)");
    // …and the delete must happen BEFORE `next` is set, or it would delete it.
    expect(block.indexOf("loginUrl.searchParams.delete(key)")).toBeLessThan(
      block.indexOf('loginUrl.searchParams.set("next"'),
    );
  });

  it("omits `next` entirely when there is nothing safe to carry", () => {
    const block = middleware.slice(
      middleware.indexOf("if (!user) {"),
      middleware.indexOf("NextResponse.redirect(loginUrl)"),
    );
    expect(block).toMatch(/if \(returnValue\) loginUrl\.searchParams\.set\("next"/);
  });
});

describe("W7 slice 3 — the sanitiser keeps its safety rails", () => {
  it("still blocks every path-level open-redirect shape", () => {
    // Protocol-relative, scheme, relative, and the auth-loop rule.
    expect(redirect).toContain('path.startsWith("//")');
    expect(redirect).toMatch(/\^\[a-z\]\[a-z0-9\+\.-\]\*:/);
    expect(redirect).toContain('!path.startsWith("/")');
    expect(redirect).toMatch(/auth\(\?:\\\/\|\$\)/);
  });

  it("blocks the backslash and percent-encoded separator bypasses", () => {
    expect(redirect).toContain("FORBIDDEN_PATH_CHARS");
    expect(redirect).toMatch(/%2f\|%5c\|%00/i);
  });

  it("keeps the credential denylist and the caps", () => {
    for (const key of [
      '"next"',
      '"code"',
      '"token"',
      '"access_token"',
      '"refresh_token"',
      '"password"',
      '"secret"',
      '"signature"',
      '"trace"',
    ]) {
      expect(redirect).toContain(key);
    }
    expect(redirect).toContain("MAX_RETURN_PATH_LENGTH");
    expect(redirect).toContain("MAX_RETURN_QUERY_PARAMS");
  });

  it("documents why it is a denylist rather than an allowlist", () => {
    // An allowlist would silently drop the next param somebody adds, which is
    // the dishonest-degradation failure mode this codebase refuses.
    expect(redirect).toMatch(/DENYLIST AND NOT AN ALLOWLIST/i);
  });
});
