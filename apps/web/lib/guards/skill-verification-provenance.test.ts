import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 6 guard — skill verification badge reflects REAL stored provenance.
 *
 * `worker_skills.source` (self_declared | work_journal | manager_confirmed,
 * migration 0010) is the stored verification provenance. The badge now renders
 * the real three-state provenance instead of a binary verified/declared, read
 * straight from the persisted column. No fake "verified", no identity badge
 * (there is no identity-verification backend).
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("the skill badge reflects the stored source provenance", () => {
  const card = read("components/app/cv-engagement-cards.tsx");
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("SkillDot carries the stored source", () => {
    expect(card).toMatch(/source\?:\s*string;/);
  });

  it("profile page maps worker_skills.source into the dots", () => {
    // the read already selects `source`; this pins that it is surfaced
    expect(page).toMatch(/worker_skills/);
    expect(page).toMatch(/source:\s*\(r\.source as string \| null\) \?\? "self_declared"/);
  });

  it("badge renders three honest states from source (no fake verified)", () => {
    expect(card).toMatch(/s\.source === "manager_confirmed"/);
    expect(card).toMatch(/s\.source === "work_journal"/);
    expect(card).toMatch(/t\("journalBacked"\)/);
    // self-declared must NOT be labelled verified/confirmed
    expect(card).toMatch(/t\("declared"\)/);
  });
});

describe("provenance i18n present (lt + en journal.cv namespace)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}/journal.json cv.journalBacked present`, () => {
      const json = JSON.parse(read(`messages/${locale}/journal.json`)) as {
        cv?: { journalBacked?: string };
      };
      expect(json.cv?.journalBacked, `${locale} cv.journalBacked`).toBeTruthy();
    });
  }
});
