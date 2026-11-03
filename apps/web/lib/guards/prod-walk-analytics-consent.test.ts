import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ANALYTICS_CONSENT_KEY, parseConsentRecord } from "@/lib/consent/analytics-consent";
import { WALK_CONSENT_KEY, walkConsentInitScript } from "../../tests/e2e/analytics-consent-seed";

/**
 * Production walks never meet the consent banner (owner review 2026-11-03):
 * every context the walk's `test` opens is seeded with a REFUSED choice before
 * its first page, unless the walk sets its own. Same two doors as the time
 * zone seed (tests/e2e/prod-walk.ts).
 */

const WEB = resolve(__dirname, "..", "..");
const MECHANISM = readFileSync(join(WEB, "tests", "e2e", "prod-walk.ts"), "utf8");

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
