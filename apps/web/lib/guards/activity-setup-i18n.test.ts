import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The dashboard activity-setup card must be fully localized (no hardcoded
 * Lithuanian shown to EN users) and must not leak internal "DB" text into
 * user-facing copy. Pins the fix for the hardcoded "VEIKLOS PRADŽIA" eyebrow.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("activity-setup card is localized, not hardcoded", () => {
  it("the dashboard page uses the i18n eyebrow, not a hardcoded string", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).not.toMatch(/VEIKLOS PRADŽIA/);
    expect(page).toMatch(/tw\("activitySetup\.eyebrow"\)/);
  });
  for (const locale of ["lt", "en"] as const) {
    const a = (JSON.parse(read(`messages/${locale}.json`)) as {
      auth: { dashboard: { wow: { activitySetup: Record<string, string> } } };
    }).auth.dashboard.wow.activitySetup;
    it(`${locale} activitySetup has eyebrow/title/body/cta`, () => {
      for (const k of ["eyebrow", "title", "body", "cta"]) {
        expect(a[k], `${locale} activitySetup.${k}`).toBeTruthy();
      }
    });
    it(`${locale} activitySetup.body has no internal DB/RPC text`, () => {
      expect(a.body).not.toMatch(/\bDB\b|\bRPC\b|database|schema/i);
    });
  }
});
