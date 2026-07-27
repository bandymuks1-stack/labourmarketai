import { describe, expect, it } from "vitest";

/**
 * Security response headers guard — security audit finding M-01.
 *
 * The audit found the app shipped with NO browser security headers: no CSP, no
 * frame protection, no Referrer-Policy, no Permissions-Policy, no nosniff, and
 * no `vercel.json` supplying them either. This guard is the control that keeps
 * them from silently disappearing again — a `next.config.ts` refactor that drops
 * `headers()` is invisible in review and produces no test failure without this.
 *
 * It asserts the REAL config object (imports `next.config.ts` and calls
 * `headers()`), not a copy of the header list, so it fails if the export shape
 * changes rather than passing against a stale duplicate.
 *
 * WHY `Referrer-Policy` GETS ITS OWN ASSERTION. Invitation tokens travel in
 * URLs in this product, and the browser default leaks the full URL — token
 * included — via `Referer`. That makes this header a real control here, not
 * boilerplate, so the guard pins the specific safe values rather than merely
 * checking the key exists.
 */

type HeaderEntry = { key: string; value: string };
type HeaderRule = { source: string; headers: HeaderEntry[] };

async function loadHeaderRules(): Promise<HeaderRule[]> {
  const mod = (await import("../../next.config")) as {
    default: { headers?: () => Promise<HeaderRule[]> };
  };
  const config = mod.default;
  expect(
    typeof config.headers,
    "next.config.ts no longer exports a headers() function — the M-01 security " +
      "headers were removed or the config shape changed",
  ).toBe("function");
  return config.headers!();
}

/** The rule that must cover every path. */
async function catchAllHeaders(): Promise<Map<string, string>> {
  const rules = await loadHeaderRules();
  const catchAll = rules.find((r) => r.source === "/:path*");
  expect(
    catchAll,
    `no catch-all header rule found (sources: ${rules.map((r) => r.source).join(", ")}). ` +
      "Security headers must apply to every path, not a subset.",
  ).toBeTruthy();
  return new Map(catchAll!.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe("security response headers (audit M-01)", () => {
  it("sends a catch-all rule covering every path", async () => {
    const headers = await catchAllHeaders();
    expect(headers.size).toBeGreaterThan(0);
  });

  it("enforces frame protection (clickjacking on one-click dashboard actions)", async () => {
    const headers = await catchAllHeaders();
    expect(headers.get("x-frame-options")).toBe("DENY");
  });

  it("enforces nosniff", async () => {
    const headers = await catchAllHeaders();
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("enforces a Referrer-Policy that cannot leak invitation tokens", async () => {
    const headers = await catchAllHeaders();
    const value = headers.get("referrer-policy");
    // These are the policies that never send a full cross-origin URL. Anything
    // else (or absent) re-opens the token-via-Referer leak.
    expect(
      ["strict-origin-when-cross-origin", "strict-origin", "no-referrer", "same-origin"],
      `Referrer-Policy is "${value}" — invitation tokens travel in URLs in this ` +
        "product, so a policy that sends full cross-origin URLs leaks them via Referer.",
    ).toContain(value);
  });

  it("enforces HSTS with a long max-age", async () => {
    const headers = await catchAllHeaders();
    const value = headers.get("strict-transport-security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1] ?? 0);
    expect(
      maxAge,
      `Strict-Transport-Security max-age is ${maxAge}; expected at least one year.`,
    ).toBeGreaterThanOrEqual(31536000);
  });

  it("enforces a Permissions-Policy that denies camera, microphone and payment", async () => {
    const headers = await catchAllHeaders();
    const value = headers.get("permissions-policy") ?? "";
    for (const feature of ["camera=()", "microphone=()", "payment=()"]) {
      expect(value, `Permissions-Policy is missing ${feature}`).toContain(feature);
    }
  });

  it("does not advertise the framework version", async () => {
    const mod = (await import("../../next.config")) as {
      default: { poweredByHeader?: boolean };
    };
    expect(
      mod.default.poweredByHeader,
      "poweredByHeader must be false — X-Powered-By tells a scanner which " +
        "framework version to look up CVEs for.",
    ).toBe(false);
  });

  /**
   * CSP ships Report-Only on purpose (inline theme script + Google Identity
   * Services + Supabase host). This asserts the policy EXISTS and contains the
   * directives that make it meaningful, so it cannot be quietly emptied — while
   * still allowing the enforced promotion to be a separate, evidence-led step.
   */
  it("ships a Content-Security-Policy (Report-Only) with the load-bearing directives", async () => {
    const headers = await catchAllHeaders();
    const csp =
      headers.get("content-security-policy") ??
      headers.get("content-security-policy-report-only") ??
      "";
    expect(csp, "no CSP header of either kind is configured").not.toBe("");
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp, `CSP is missing "${directive}"`).toContain(directive);
    }
  });

  it("never allows a wildcard default-src", async () => {
    const headers = await catchAllHeaders();
    const csp =
      headers.get("content-security-policy") ??
      headers.get("content-security-policy-report-only") ??
      "";
    expect(
      /default-src[^;]*\*/.test(csp),
      `CSP default-src contains a wildcard, which defeats the policy: ${csp}`,
    ).toBe(false);
  });
});
