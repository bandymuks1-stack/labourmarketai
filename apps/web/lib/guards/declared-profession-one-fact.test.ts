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

describe("Opportunities shows what the person said they do", () => {
  const page = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("reads the one shared profession reader", () => {
    expect(page).toMatch(/getProfessionEntries\(\)/);
    expect(read("lib/today/today-server.ts")).toMatch(/getProfessionEntries\(\)/);
  });

  it("own words are shown when no catalogue profession names them", () => {
    expect(page).toMatch(/if \(ownProfessionWords\) \{\s*facts\.push\(t\("world\.fact\.profession", \{ value: ownProfessionWords \}\)\)/);
  });

  it("'not stated' only when nothing was stated", () => {
    expect(page).toMatch(/else if \(!ownProfessionWords\) \{\s*facts\.push\(t\("world\.fact\.professionMissing"\)\)/);
  });

  it("a records-derived profession is said beside the words, not instead of them", () => {
    const i = page.indexOf("if (ownProfessionWords) {");
    const j = page.indexOf('t("world.fact.professionEvidenced"', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
