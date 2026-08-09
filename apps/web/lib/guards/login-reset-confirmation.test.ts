import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Password recovery must END in a confirmation, not in silence.
 *
 * `reset-password-form.tsx` has always routed to `/auth/login?reset=1` after
 * `updateUser` succeeded — but NOTHING read `reset`. The person had just typed
 * a new password twice and was dropped on a bare login screen with no sign it
 * had saved, so "it worked" and "it silently failed" looked identical. Found by
 * the auth audit on 2026-08-09; the param had been dead since it was written.
 *
 * THIS IS A PRODUCER/CONSUMER PAIR IN TWO FILES. That is exactly the drift this
 * repo keeps finding: one side keeps emitting a signal the other side stopped
 * (or never started) reading, and nothing fails. The guard pins BOTH ends
 * together plus the copy they need, so removing either half turns red.
 *
 * The rendered result is asserted in a real browser by
 * `tests/e2e/auth.spec.ts` — this guard covers the wiring, not the pixels.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** LT/EN/RU/NL/DE — the ACTIVE set (lib/i18n/config.ts). */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("password reset ends in a confirmation", () => {
  const resetForm = read("components/app/reset-password-form.tsx");
  const loginForm = read("components/app/login-form.tsx");

  it("PRODUCER: reset-password still signals success with ?reset=1", () => {
    expect(resetForm).toMatch(/\/auth\/login\?reset=1/);
  });

  it("CONSUMER: the login form reads that exact param", () => {
    expect(loginForm).toMatch(/searchParams\.get\("reset"\) === "1"/);
  });

  it("renders a status (not an error) region carrying the confirmation copy", () => {
    expect(loginForm).toMatch(/login-reset-success/);
    expect(loginForm).toMatch(/t\("reset_success"\)/);
    // A success message announced as an alert would be read as a failure.
    const block = loginForm.slice(loginForm.indexOf("passwordWasReset &&"));
    expect(block.slice(0, 400)).toMatch(/role="status"/);
  });

  it("says nothing about the account — it is rendered from a query param alone", () => {
    for (const loc of ACTIVE_LOCALES) {
      const copy = JSON.parse(read(`messages/${loc}.json`)).auth.login
        .reset_success as string;
      expect(copy, `${loc} reset_success`).toBeTruthy();
      expect(copy).not.toMatch(/@/);
      expect(copy).not.toMatch(/\{/);
    }
  });
});

describe("reset_success copy exists in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    it(`${loc}: auth.login.reset_success is present and translated`, () => {
      const copy = JSON.parse(read(`messages/${loc}.json`)).auth.login
        .reset_success as string;
      expect(copy, `${loc} reset_success`).toBeTruthy();
      // No untranslated marker (doctrine §7.4 — active locales carry no [EN]).
      expect(copy.startsWith("[EN]"), `${loc} still marked [EN]`).toBe(false);
    });
  }

  it("the non-English active locales are not the English string verbatim", () => {
    const en = JSON.parse(read("messages/en.json")).auth.login
      .reset_success as string;
    for (const loc of ["lt", "ru", "nl", "de"] as const) {
      const copy = JSON.parse(read(`messages/${loc}.json`)).auth.login
        .reset_success as string;
      expect(copy, `${loc} is an untranslated copy of EN`).not.toBe(en);
    }
  });
});
