import { describe, expect, it } from "vitest";

import { routing } from "@/lib/i18n/routing";

/**
 * V8 §6 — the language preference must survive the browser session.
 *
 * next-intl's default NEXT_LOCALE cookie ships with NO maxAge — a session
 * cookie. Measured consequence (language audit, 2026-08-13): a person who
 * chose Russian was back on the Lithuanian default the next morning, same
 * device, logged in — because `profiles.locale` is write-only and the cookie
 * had died with the browser. Until the account-level preference is read,
 * this cookie IS the persistence layer, so its lifetime is behaviour, not
 * configuration taste.
 *
 * Behavioural, not a source grep: the assertion imports the real routing
 * object, so moving the config or renaming the file cannot green-wash it.
 */
describe("NEXT_LOCALE persistence", () => {
  it("the locale cookie carries a maxAge of at least 180 days", () => {
    const cookie = routing.localeCookie;
    // `false` would disable the cookie entirely — a different (wrong) answer.
    expect(cookie).not.toBe(false);
    const maxAge = (cookie as { maxAge?: number }).maxAge;
    expect(typeof maxAge).toBe("number");
    expect(maxAge as number).toBeGreaterThanOrEqual(60 * 60 * 24 * 180);
  });
});
