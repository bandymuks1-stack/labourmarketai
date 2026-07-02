import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Funnel-reporting reproducibility guards (findings F-T2/F-T3 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - A local read-only activation report CLI exists, is wired as a pnpm
 *     script, hashes ids, excludes admin + seed accounts, and writes only
 *     under runtime/ (gitignored — never committed).
 *   - The admin telemetry inbox has an "exclude admins" toggle that keeps
 *     anon rows and reports how many rows were hidden.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("generate-activation-report CLI (F-T2)", () => {
  const script = read("scripts/generate-activation-report.ts");

  it("is wired as a pnpm script", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["generate-activation-report"]).toContain(
      "generate-activation-report.ts",
    );
  });

  it("anonymizes ids with a hash before output", () => {
    expect(script).toMatch(/createHash\("sha256"\)/);
    expect(script).toMatch(/anon\(/);
  });

  it("excludes admin and seed accounts from funnel numbers", () => {
    expect(script).toMatch(/active_role.*admin|"admin"/);
    expect(script).toMatch(/profile_roles/);
    expect(script).toMatch(/@example\.com/);
  });

  it("writes only under runtime/ (gitignored)", () => {
    expect(script).toMatch(/"runtime",\s*\n?\s*"reports"/);
    expect(script).not.toMatch(/docs\/|apps\/web\/public/);
  });

  it("reads only pilot_events + exclusion ids — no private text tables", () => {
    for (const banned of [
      "journal_entries",
      "profile_text",
      "language_feedback",
      "conversation_messages",
    ]) {
      expect(script).not.toContain(`"${banned}"`);
    }
  });
});

describe("admin telemetry exclude-admins toggle (F-T3)", () => {
  const page = read("app/[locale]/dashboard/admin/telemetry/page.tsx");

  it("supports the excludeAdmins search param", () => {
    expect(page).toMatch(/excludeAdmins/);
    expect(page).toMatch(/telemetry-admin-filter/);
  });

  it("anon rows always stay visible", () => {
    expect(page).toMatch(/!r\.profile_id \|\| !adminIds\.has\(r\.profile_id\)/);
  });

  it("reports the hidden count and keys exist in en/lt/ru", () => {
    expect(page).toMatch(/hiddenNote/);
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(msgs.telemetry.filter.excludeAdmins, locale).toBeTruthy();
      expect(msgs.telemetry.filter.hiddenNote, locale).toBeTruthy();
    }
  });
});
