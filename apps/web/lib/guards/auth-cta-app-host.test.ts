import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { preferAppHostHref } from "@/lib/domain/canonical";

/**
 * Auth-CTA app-host guard.
 *
 * OAuth uses PKCE: the `code_verifier` cookie lives on the origin where sign-in
 * STARTS and must be readable at the callback. A public-marketing-host visitor
 * who starts login via a relative `/auth/login` would begin OAuth on the apex
 * but return to the app host — verifier missing, exchange fails. The marketing
 * nav's auth CTA must therefore pin to the app origin on marketing hosts while
 * staying relative on the app host and in local dev.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("preferAppHostHref keeps the OAuth round-trip same-origin", () => {
  it("app host → relative (normal same-host nav)", () => {
    expect(preferAppHostHref("app.labourmarket.ai", "/lt/auth/login")).toBe(
      "/lt/auth/login",
    );
    // port + case are normalised
    expect(preferAppHostHref("APP.LABOURMARKET.AI:443", "/lt/auth/login")).toBe(
      "/lt/auth/login",
    );
  });

  it("localhost / loopback (dev) → relative (never bounce dev to prod)", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3993", "0.0.0.0"]) {
      expect(preferAppHostHref(h, "/lt/auth/login")).toBe("/lt/auth/login");
    }
  });

  it("apex / www / vercel alias → absolute app-origin URL", () => {
    expect(preferAppHostHref("labourmarket.ai", "/lt/auth/login")).toBe(
      "https://app.labourmarket.ai/lt/auth/login",
    );
    expect(preferAppHostHref("www.labourmarket.ai", "/en/auth/signup")).toBe(
      "https://app.labourmarket.ai/en/auth/signup",
    );
    expect(
      preferAppHostHref("labourmarket-ai.vercel.app", "/lt/auth/login"),
    ).toBe("https://app.labourmarket.ai/lt/auth/login");
  });

  it("missing host → relative (safe default)", () => {
    expect(preferAppHostHref(null, "/lt/auth/login")).toBe("/lt/auth/login");
  });
});

describe("the marketing nav routes login + signup through the app-host CTA", () => {
  const nav = read("components/app/../layouts/site-nav.tsx");
  const cta = read("components/layouts/auth-cta-link.tsx");

  it("SiteNav uses AuthCtaLink for both login and signup", () => {
    expect(nav).toMatch(/AuthCtaLink/);
    expect(nav).toMatch(/\/auth\/login/);
    expect(nav).toMatch(/\/auth\/signup/);
    // The bare locale Link for auth CTAs is gone (would be relative-only).
    expect(nav).not.toMatch(/<Link\s+href="\/auth\/login"/);
  });

  it("AuthCtaLink SSR-defaults to the relative path and upgrades via preferAppHostHref", () => {
    expect(cta).toMatch(/useState\(relPath\)/);
    expect(cta).toMatch(/preferAppHostHref\(window\.location\.host, relPath\)/);
  });
});
