import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Worker first-session dead-end guards (findings F-W2 / F-W4 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - The journal no-context screen (a PRIMARY nav tab) always renders a
 *     real CTA — for `none` and `roster`, not only `pending`.
 *   - The `none` state additionally points to the profile, the one place a
 *     brand-new solo worker can create value today.
 *   - The skill-claim apply failure shows a real error message, never the
 *     "Pasirinkti" confirm-button label.
 *   - The message keys exist in en/lt/ru.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("journal no-context states never dead-end", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");

  it("the dashboard CTA renders unconditionally (not only for pending)", () => {
    expect(page).toMatch(/noContextCta/);
    // The old bug: {contextState === "pending" && (<Link ... noContextCta
    expect(page).not.toMatch(
      /contextState === "pending" && \([\s\S]{0,400}?noContextCta/,
    );
  });

  it("the none state points the worker at the profile", () => {
    expect(page).toMatch(/contextState === "none" && \(/);
    expect(page).toMatch(/noContextProfileCta/);
    expect(page).toMatch(/href="\/dashboard\/profile"/);
  });

  it("message keys exist in en/lt/ru", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}/journal.json`));
      expect(
        msgs.noContextProfileCta,
        `noContextProfileCta missing in ${locale}`,
      ).toBeTruthy();
      expect(msgs.noContextCta, `noContextCta missing in ${locale}`).toBeTruthy();
    }
  });
});

describe("skill-claim apply failure shows a real error", () => {
  const flow = read("components/app/profile-text-first-flow.tsx");

  it("uses the dedicated applyErrorLabel key in the catch branch", () => {
    expect(flow).toMatch(/setError\(t\("applyErrorLabel"\)\)/);
    expect(flow).not.toMatch(/setError\(tS\("actions\.confirm"\)\)/);
  });

  it("applyErrorLabel exists under skills.textFirst in en/lt/ru", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(
        msgs.skills?.textFirst?.applyErrorLabel,
        `applyErrorLabel missing in ${locale}`,
      ).toBeTruthy();
    }
  });
});
