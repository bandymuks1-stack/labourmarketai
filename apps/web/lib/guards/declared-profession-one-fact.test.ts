import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE DECLARED PROFESSION, EVERY SURFACE (owner production walk 2026-09-28
 * §9: "enter profession once → Home → Profile → Living CV → Opportunities
 * must all read the same fact"; "No skills-derived profession may silently
 * replace the person's declaration").
 *
 * A person whose profession the catalogue does not carry lives in
 * `worker_professions.label` (own words). Home (ŠIANDIEN), the profile and
 * the Living CV already read it; Opportunities printed "profesija
 * nenurodyta" to that same person. Pinned: Opportunities reads the SAME
 * cached reader, shows the words, and a profession read from records is said
 * BESIDE them, never instead. Matching is untouched (catalogue slug only).
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

describe("Opportunities does not repeat the person's own settings back at them", () => {
  // Owner order 2026-10-01: the "this is you" block (profession / skills /
  // place / pay / languages) is gone from Darbo galimybės — the person's own
  // facts are not search filters and need not be restated above the results.
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("the declared-profession reader still serves Today (the one shared reader)", () => {
    expect(read("lib/today/today-server.ts")).toMatch(/getProfessionEntries\(\)/);
  });

  it("the page carries no assessed-facts identity panel", () => {
    expect(page).not.toMatch(/opportunities-identity-facts|opportunities-assessment/);
    expect(page).not.toMatch(/world\.fact\./);
    expect(page).not.toMatch(/world\.youTitle/);
  });
});
