import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ANALYTICS_CONSENT_KEY,
  NON_ESSENTIAL_KEY_PREFIXES,
  NON_ESSENTIAL_LOCAL_KEYS,
  NON_ESSENTIAL_SESSION_KEYS,
  parseConsentRecord,
} from "@/lib/consent/analytics-consent";
import { WALK_CONSENT_KEY, walkConsentInitScript } from "../../tests/e2e/analytics-consent-seed";
import {
  ANALYTICS_KEY_PREFIXES,
  ANALYTICS_LOCAL_KEYS,
  ANALYTICS_SESSION_KEYS,
} from "../../tests/e2e/first-visit-consent";

/**
 * Production walks never meet the consent banner (owner review 2026-11-03):
 * every context the walk's `test` opens is seeded with a REFUSED choice before
 * its first page, unless the walk sets its own. Same two doors as the time
 * zone seed (tests/e2e/prod-walk.ts).
 */

const WEB = resolve(__dirname, "..", "..");
const MECHANISM = readFileSync(join(WEB, "tests", "e2e", "prod-walk.ts"), "utf8");
const E2E = (f: string) => readFileSync(join(WEB, "tests", "e2e", f), "utf8");

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function installWindow(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    },
  };
  return map;
}

describe("the walk consent seed", () => {
  it("uses the product's own key", () => {
    expect(WALK_CONSENT_KEY).toBe(ANALYTICS_CONSENT_KEY);
  });

  it("writes a valid REFUSED choice when none exists", () => {
    const map = installWindow();
    walkConsentInitScript(WALK_CONSENT_KEY);
    expect(parseConsentRecord(map.get(WALK_CONSENT_KEY) ?? null)?.choice).toBe("refused");
  });

  it("keeps a choice a walk set itself (an attribution walk grants)", () => {
    const granted = JSON.stringify({ choice: "granted", decidedOn: "2026-11-03" });
    const map = installWindow({ [WALK_CONSENT_KEY]: granted });
    walkConsentInitScript(WALK_CONSENT_KEY);
    expect(map.get(WALK_CONSENT_KEY)).toBe(granted);
  });

  it("never throws when storage is blocked", () => {
    (globalThis as { window?: unknown }).window = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    };
    expect(() => walkConsentInitScript(WALK_CONSENT_KEY)).not.toThrow();
  });

  it("both doors of the walk's test seed it: the context fixture and browser.newContext", () => {
    const calls = MECHANISM.match(/await seedWalkAnalyticsConsent\((context|ctx)\);/g) ?? [];
    expect(calls.sort()).toEqual(["await seedWalkAnalyticsConsent(context);", "await seedWalkAnalyticsConsent(ctx);"]);
  });
});

/**
 * The seed must never hide the real first visit everywhere (owner P0
 * 2026-11-03): the fresh-activation walk meets the banner on the sign-up page
 * in an unseeded context and refuses it; the isolated sign-up refuses it and
 * then signs up and onboards.
 */
describe("the real first-visit banner is walked", () => {
  it("the e2e check reads exactly the product's analytics keys", () => {
    expect(ANALYTICS_LOCAL_KEYS).toEqual(NON_ESSENTIAL_LOCAL_KEYS);
    expect(ANALYTICS_SESSION_KEYS).toEqual(NON_ESSENTIAL_SESSION_KEYS);
    expect(ANALYTICS_KEY_PREFIXES).toEqual(NON_ESSENTIAL_KEY_PREFIXES);
  });

  it("only a firstVisit(...) context skips the seed, and only the consent part", () => {
    expect(MECHANISM).toMatch(/if \(!unseeded\) await seedWalkAnalyticsConsent\(ctx\);/);
    expect(MECHANISM).toMatch(/await seedViewerTimeZone\(ctx\);\r?\n\s+if \(!unseeded\)/);
  });

  it("the production fresh-activation walk refuses the banner on the sign-up page and never submits", () => {
    const spec = E2E("prod-fresh-activation.spec.ts");
    expect(spec).toMatch(/browser\.newContext\(firstVisit\(/);
    expect(spec).toMatch(/page\.goto\(`\/lt\/auth\/signup\?\$\{FIRST_VISIT_CAMPAIGN\}`\);\s+await refuseOnFirstVisit\(page\);/);
    expect(spec.match(/firstVisit\(/g)).toHaveLength(1);
    // No account is ever created by a production walk (owner decision 2026-10-28).
    expect(spec).not.toMatch(/type="submit"|name="password"|confirm_password/);
  });

  it("the isolated sign-up refuses the real banner before signing up", () => {
    const spec = E2E("signup-isolated.spec.ts");
    expect(spec).toMatch(/await signUp\(page, address, PASSWORD, \{ refuseConsent: true \}\);/);
    expect(spec).not.toMatch(/analytics-consent-seed|prod-walk/);
  });
});
