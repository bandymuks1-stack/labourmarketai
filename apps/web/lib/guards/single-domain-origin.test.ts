import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Single-domain origin guard (policy 2026-07-19, owner task
 * `single-domain-and-deep-cleanup-v1`).
 *
 * https://labourmarket.ai is the ONLY product origin. The legacy
 * hosts `www.labourmarket.ai` and `app.labourmarket.ai` exist solely
 * as 308 redirect aliases (middleware + next.config). This guard
 * fails the build if the split-domain architecture starts creeping
 * back in:
 *
 *   1. no `preferAppHostHref`-style CTA host upgrade anywhere;
 *   2. `app.labourmarket.ai` never appears in product source outside
 *      the explicit redirect/policy allowlist;
 *   3. no visible raw Supabase project-ref host in user-facing
 *      source (messages, components, app routes);
 *   4. auth CTAs stay relative (same-origin PKCE round-trip).
 */

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Directories scanned for forbidden origin literals. */
const SCAN_DIRS = ["app", "components", "lib", "messages"] as const;

/** Files allowed to mention the legacy app host — the redirect/policy
 *  surface itself plus tests that assert the redirect behaviour. */
const APP_HOST_ALLOWLIST = new Set([
  "lib/domain/canonical.ts",
  "lib/domain/canonical.test.ts",
  "lib/domain/middleware-redirect.test.ts",
  "lib/seo/seo-indexing-audit.ts",
  "lib/auth/oauth-trace.test.ts",
  // Asserts the legacy app host is REJECTED as a CSRF origin.
  "lib/auth/google-id-token.test.ts",
  "lib/guards/auth-middleware-session.test.ts",
  "lib/guards/single-domain-origin.test.ts",
]);

/** Files allowed to mention the raw Supabase project ref:
 *  - lib/env.ts: build-time zod default so CI builds pass without
 *    secrets (the value itself is not a secret; it is never rendered);
 *  - admin project-truth page: owner-only operational SQL context;
 *  - guards that assert the ref is NOT leaked. */
const SUPABASE_REF_ALLOWLIST = new Set([
  "lib/env.ts",
  "app/[locale]/dashboard/admin/project-truth/page.tsx",
  "lib/guards/login-branding-no-infra-leak.test.ts",
  "lib/guards/product-readiness.test.ts",
  "lib/guards/public-brand-name.test.ts",
  "lib/guards/single-domain-origin.test.ts",
]);

const SUPABASE_REF = /gorgitwvdzxbnaxhrsrw/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|json)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function scan(pattern: RegExp, allowlist: Set<string>): string[] {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of collectSourceFiles(join(WEB_ROOT, dir))) {
      const rel = relative(WEB_ROOT, file).split(sep).join("/");
      if (allowlist.has(rel)) continue;
      if (pattern.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
  }
  return offenders;
}

describe("single-domain policy — no split-domain regression", () => {
  it("preferAppHostHref stays removed from the whole web app", () => {
    const offenders = scan(
      /preferAppHostHref/,
      // The SEO audit's own "must stay removed" regex is the only
      // legitimate mention besides this guard.
      new Set([
        "lib/guards/single-domain-origin.test.ts",
        "lib/seo/seo-indexing-audit.ts",
      ]),
    );
    expect(offenders).toEqual([]);
  });

  it("app.labourmarket.ai appears only in the redirect/policy allowlist", () => {
    // Comments explaining the policy are fine in allowlisted files; any
    // other appearance risks re-advertising the legacy host.
    const offenders = scan(/app\.labourmarket\.ai/, APP_HOST_ALLOWLIST);
    expect(offenders).toEqual([]);
  });

  it("the legacy app host is classified as a redirect alias in canonical.ts", () => {
    const canonical = read("lib/domain/canonical.ts");
    expect(canonical).toMatch(/LEGACY_APP_HOST\s*=\s*"app\.labourmarket\.ai"/);
    expect(canonical).toMatch(/LEGACY_REDIRECT_HOSTS[\s\S]*LEGACY_APP_HOST/);
  });

  it("next.config redirects both legacy hosts to the apex permanently", () => {
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/www\.labourmarket\.ai/);
    expect(cfg).toMatch(/app\.labourmarket\.ai/);
    expect(cfg).toMatch(/https:\/\/labourmarket\.ai\/:path\*/);
    expect(cfg).toMatch(/permanent:\s*true/);
  });
});

describe("single-domain policy — no visible raw Supabase host", () => {
  it("the raw project ref never appears in user-facing source", () => {
    const offenders = scan(SUPABASE_REF, SUPABASE_REF_ALLOWLIST);
    expect(offenders).toEqual([]);
  });

  it("locale messages never mention supabase.co at all", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(WEB_ROOT, "messages"))) {
      if (/supabase\.co/.test(readFileSync(file, "utf8"))) {
        offenders.push(relative(WEB_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("single-domain policy — auth CTAs stay relative", () => {
  it("AuthCtaLink renders the relative path with no host upgrade", () => {
    const cta = read("components/layouts/auth-cta-link.tsx");
    expect(cta).toMatch(/href=\{relPath\}/);
    expect(cta).not.toMatch(/preferAppHostHref|APP_ORIGIN|window\.location/);
  });

  it("SiteNav still routes login + signup through AuthCtaLink", () => {
    const nav = read("components/layouts/site-nav.tsx");
    expect(nav).toMatch(/AuthCtaLink/);
    expect(nav).toMatch(/\/auth\/login/);
    expect(nav).toMatch(/\/auth\/signup/);
  });
});
