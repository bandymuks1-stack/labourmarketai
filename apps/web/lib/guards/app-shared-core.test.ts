import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * APP SHARED CORE — the claims in docs/APP_READINESS_MAP.md, pinned.
 *
 * The map says a second client (Android, MCP, iOS) would not have to
 * reimplement journal evidence derivation, matching, LMC accounting,
 * permissions, entitlements or AI privacy routing — because those already live
 * in framework-free modules or in the database.
 *
 * That claim is only true while it stays true. A single `import { cookies }
 * from "next/headers"` added to the matching engine silently converts a
 * portable module into a web-only one, and nothing else in the suite would
 * notice. So the portability of the specific domains the map names is asserted
 * here, mechanically.
 *
 * This guard deliberately does NOT assert the total counts in the map's tables
 * — those are a snapshot and will drift as the product grows. It asserts the
 * PROPERTY the map depends on.
 */

const LIB = join(process.cwd(), "lib");

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Domains the map classifies SHARED DOMAIN READY — no framework coupling. */
const PORTABLE_DOMAINS = ["structuring", "market", "billing", "cv", "taxonomy"] as const;

/**
 * The two known exceptions, and why each is tolerated.
 *
 * Both couple to the framework for CACHING ONLY — request-scoped memoisation
 * and route-cache tagging. Neither carries a domain rule, so a second client
 * bringing its own caching loses nothing and reimplements nothing.
 *
 * They are listed BY NAME rather than pattern-matched, so a third one cannot
 * appear quietly: adding a framework import to a portable domain has to be an
 * explicit, reviewed edit to this list.
 */
const CACHING_ONLY_EXCEPTIONS = new Set([
  // React `cache()` — one Supabase client + one getUser per request.
  "billing/billing-subject.ts",
  // Next `unstable_cache` — landing-page market facts, revalidated by tag.
  "market/live-market-landing.ts",
]);

describe("the portable domains stay portable", () => {
  for (const domain of PORTABLE_DOMAINS) {
    it(`lib/${domain} imports no React and no Next.js`, () => {
      const offenders: string[] = [];
      for (const file of tsFiles(join(LIB, domain))) {
        const rel = file.slice(LIB.length + 1).replace(/\\/g, "/");
        if (CACHING_ONLY_EXCEPTIONS.has(rel)) continue;
        const src = readFileSync(file, "utf8");
        if (/from "next\//.test(src) || /from "react"/.test(src)) {
          offenders.push(rel);
        }
      }
      expect(offenders, `framework import added to lib/${domain}`).toEqual([]);
    });
  }

  it("the tolerated exceptions really are caching-only", () => {
    // If one of them ever grows a domain rule the exemption stops being
    // harmless, so the exemption is tied to what each file actually imports.
    const subject = readFileSync(join(LIB, "billing", "billing-subject.ts"), "utf8");
    expect(subject).toContain('import { cache } from "react"');
    expect(subject).not.toMatch(/from "next\//);

    const landing = readFileSync(join(LIB, "market", "live-market-landing.ts"), "utf8");
    expect(landing).toContain('from "next/cache"');
    expect(landing).not.toMatch(/from "react"/);
  });

  it("the AI runtime policy layer is pure — no server-only, no next, no react", () => {
    // The env boundary is `runtime/config.ts` and the persistence boundary is
    // `runtime/audit-store.ts`; both are legitimately server-only. Everything
    // that DECIDES — task policy, sensitivity, the egress gate, the provider
    // chain, pricing — must stay callable from anywhere, because a second
    // client has to be able to reason about the same rules.
    const decisionLayer = [
      "runtime/task-routing.ts",
      "runtime/data-sensitivity.ts",
      "runtime/data-egress.ts",
      "runtime/provider-chain.ts",
      "runtime/model-pricing.ts",
      "runtime/model-registry.ts",
      "runtime/config-core.ts",
    ];
    for (const rel of decisionLayer) {
      const src = readFileSync(join(LIB, "ai", rel), "utf8");
      expect(src, `${rel} must not be server-only`).not.toContain('"server-only"');
      expect(src, `${rel} must not import next`).not.toMatch(/from "next\//);
      expect(src, `${rel} must not import react`).not.toMatch(/from "react"/);
    }
  });

  it("the entitlement rules are pure — a client may compute what a plan allows", () => {
    for (const rel of ["entitlements.ts", "entitlements-v1.ts", "plans.ts", "lmc-flags.ts"]) {
      const src = readFileSync(join(LIB, "billing", rel), "utf8");
      expect(src, `${rel} must not be server-only`).not.toContain('"server-only"');
      expect(src, `${rel} must not import next`).not.toMatch(/from "next\//);
    }
  });
});

describe("the single transport blocker is real and is where the map says", () => {
  it("the request-scoped Supabase client resolves identity from COOKIES only", () => {
    // This is §2 of the map. If a bearer path is ever added, it will be an
    // owner-approved auth-core slice — and this assertion is the thing that
    // will fail and force the map to be updated with it.
    const src = readFileSync(join(LIB, "supabase", "server.ts"), "utf8");
    expect(src).toContain('from "next/headers"');
    expect(src).toContain("cookieStore.getAll()");
    expect(src, "a bearer path appeared — update APP_READINESS_MAP §2/§5")
      .not.toMatch(/authorization|bearer/i);
  });

  it("no API route has grown its own private auth scheme", () => {
    // Worse than having no bearer path would be having several, invented
    // per-route. Every authenticating route must go through the ONE client.
    const apiDir = join(process.cwd(), "app", "api");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") {
          const src = readFileSync(p, "utf8");
          if (/req\.headers\.get\(\s*["']authorization/i.test(src)) {
            offenders.push(p.slice(process.cwd().length + 1).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(apiDir);
    // The Stripe webhook verifies a STRIPE signature, not an app identity —
    // that is a different mechanism and is not an auth scheme for a user.
    expect(offenders, "an ad-hoc route-level auth scheme appeared").toEqual([]);
  });
});
