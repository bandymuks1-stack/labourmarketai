import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Login UX guard: Google-account users must not get stuck on the password form.
 *
 * Owner report: "why does it ask for a password when I logged in with Google
 * without one?" A Google-created account has no password, so an email/password
 * attempt fails with "invalid credentials". The login form must, on a failed
 * password attempt, point the user back to the Google button — never leave them
 * stuck on a password they never set.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("login form surfaces the Google path after a password failure", () => {
  const src = read("components/app/login-form.tsx");

  it("tracks a failed password attempt and renders the Google hint", () => {
    expect(src).toMatch(/passwordFailed/);
    expect(src).toMatch(/setPasswordFailed\(true\)/);
    expect(src).toMatch(/login-google-hint/);
    expect(src).toMatch(/t\("google_hint"\)/);
  });

  it("clears the hint when the user edits the email (correcting course)", () => {
    expect(src).toMatch(/if \(passwordFailed\) setPasswordFailed\(false\)/);
  });

  it("still offers Google as a first-class method (button above the divider)", () => {
    const googleIdx = src.indexOf("GoogleButton");
    const dividerIdx = src.indexOf('t("divider")');
    expect(googleIdx).toBeGreaterThan(-1);
    expect(dividerIdx).toBeGreaterThan(-1);
    // Google button is rendered before the "or" divider → it's the primary path.
    expect(googleIdx).toBeLessThan(dividerIdx);
  });
});

describe("google_hint copy exists in every active locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: auth.login.google_hint is present and mentions Google`, () => {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const hint = m.auth.login.google_hint as string;
      expect(hint, `${loc} google_hint`).toBeTruthy();
      expect(/google/i.test(hint)).toBe(true);
    });
  }
});
