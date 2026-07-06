import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Account security guard (quality-train PR F — security docs step 1).
 *
 * Security is a USER BENEFIT, never coercion (docs/security/
 * authentication-and-mfa-v1.md §2): the copy may protect, keep, recover —
 * it may never demand. And the section may only state what is REALLY true:
 * protection status comes from a live listFactors() read, sign-in methods
 * from the user's identity providers, and there is NO enrollment button
 * until the enrollment PR ships a working flow.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const PAGE = read("app/[locale]/dashboard/account/page.tsx");

// Coercive vocabulary per locale (docs §2 forbidden list + LT/RU equivalents).
const COERCIVE: Record<string, RegExp> = {
  lt: /privalai|privaloma|privalote|užblokuot|būtina įjungti/i,
  en: /required|mandatory|blocked|you must|forced/i,
  ru: /обязательн|заблокирован|вы должны/i,
};

describe("security section states only what is really true", () => {
  it("the section exists on the account page", () => {
    expect(PAGE).toMatch(/data-testid="account-security"/);
  });

  it("protection status comes from a LIVE listFactors read, never a constant", () => {
    expect(PAGE).toMatch(/supabase\.auth\.mfa\.listFactors\(\)/);
    // Status renders ONLY when the read succeeded (null = no claim at all)…
    expect(PAGE).toMatch(/mfaFactorCount !== null &&/);
    // …and "active" requires at least one VERIFIED factor.
    expect(PAGE).toMatch(/f\.status === "verified"/);
    expect(PAGE).toMatch(/mfaFactorCount > 0/);
  });

  it("sign-in methods derive from the user's real identity providers", () => {
    expect(PAGE).toMatch(/user\.identities/);
    expect(PAGE).toMatch(/identityProviders\.has\("email"\)/);
    expect(PAGE).toMatch(/identityProviders\.has\("google"\)/);
  });

  it("change-password renders only for password identities and uses the REAL reset flow", () => {
    expect(PAGE).toMatch(/\{hasPasswordSignIn && \(/);
    expect(PAGE).toMatch(/href="\/auth\/forgot-password"/);
  });

  it("no enrollment button until the enrollment PR ships a working flow", () => {
    // The docs' step-2 flow (enroll → QR → verify) is a separate PR; until
    // then the section must not render a setup control that goes nowhere.
    expect(PAGE).not.toMatch(/mfa\.enroll\(|mfa-enroll|enrollMfa/);
  });
});

describe("benefit framing — never coercion (docs §2)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: security copy carries no coercive vocabulary`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        auth: {
          dashboard: { account: { security: Record<string, unknown> } };
        };
      };
      const security = msgs.auth.dashboard.account.security;
      expect(security, `${loc}: security namespace missing`).toBeTruthy();
      const blob = JSON.stringify(security);
      expect(blob).not.toMatch(COERCIVE[loc]);
      // Structure parity: the section never renders raw keys.
      for (const key of ["title", "intro", "signin", "mfa", "recovery", "comingLater"]) {
        expect(security[key], `${loc}: security.${key}`).toBeTruthy();
      }
    });
  }

  it("the reset flow the link points at really exists", () => {
    expect(
      readFileSync(
        join(ROOT, "app", "[locale]", "auth", "forgot-password", "page.tsx"),
        "utf8",
      ).length,
    ).toBeGreaterThan(0);
  });
});
