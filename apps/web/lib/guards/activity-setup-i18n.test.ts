import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The activity-setup copy must stay fully localized (no hardcoded Lithuanian
 * shown to EN users) and must not leak internal "DB" text into user-facing copy.
 * Pins the fix for the hardcoded "VEIKLOS PRADŽIA" eyebrow.
 *
 * Update (slice my-space-human-entry-v1): the worker dashboard no longer renders
 * the activity-setup link — a "start a company/agency/buyer" role/module surface
 * does not belong on a person's calm "Mano erdvė" entry. The route still exists
 * and is reached from /dashboard/account → "Mano erdvės". So this guard no longer
 * asserts the link is mounted on the dashboard page; it keeps the localization
 * coverage + no-hardcoded-LT + no-internal-DB-text checks, which still matter
 * wherever the activity-setup copy is used.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("activity-setup card is localized, not hardcoded", () => {
  it("the dashboard page ships no hardcoded LT eyebrow", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).not.toMatch(/VEIKLOS PRADŽIA/);
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
