import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 3 guard — profile completion status reads REAL saved state.
 *
 * The profile/CV clarity card used to be a static info checklist. It now shows
 * per-step Added / To-add status computed from persisted data (profile_text,
 * worker_skills, journal_entries, profile_skill_claims). Honest by design: no
 * aggregate %/score, no fake "verified", `awaitingProof` stays informational.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("Guard: profile completion status is consolidated into the hub", () => {
  const page = read("app/[locale]/dashboard/profile/page.tsx");

  it("the standalone clarity card is no longer a competing panel on the page", () => {
    // Consolidated (P0 profile rescue): the single ProfileHubOverview now shows
    // CV/skills/journal status (incl. what's missing). The component + its i18n
    // are still tested below. See journal-profile-single-path.test.ts.
    expect(page).not.toMatch(/<ProfileCvClarityCard\b/);
  });

  it("counts journal entries from the real table (read-back, not invented)", () => {
    expect(page).toMatch(/from\(["']journal_entries["']\)/);
    expect(page).toMatch(/journalCount\s*=\s*jCount\s*\?\?\s*0/);
  });
});

describe("Guard: the clarity card renders honest per-step status", () => {
  const src = read("components/app/profile-cv-clarity-card.tsx");

  it("renders Added / To-add from the state prop", () => {
    expect(src).toMatch(/state\?:\s*Partial<Record<ActionableStep, boolean>>/);
    expect(src).toMatch(/data-status=\{done \? "done" : "todo"\}/);
    expect(src).toMatch(/t\("statusDone"\)/);
    expect(src).toMatch(/t\("statusTodo"\)/);
  });

  it("invents no gamified score and no fake verification", () => {
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(codeOnly).not.toMatch(/100%|percent|complete\b.*score|\bverified\b/i);
  });
});

describe("Guard: completion status i18n present (lt + en)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json profileCvClarity has statusDone + statusTodo`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        profileCvClarity?: Record<string, unknown>;
      };
      const ns = json.profileCvClarity;
      expect(ns?.statusDone, `${locale}.profileCvClarity.statusDone`).toBeTruthy();
      expect(ns?.statusTodo, `${locale}.profileCvClarity.statusTodo`).toBeTruthy();
    });
  }
});
