import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SKILL_HINTS_LT,
  ACTIVITY_HINTS_LT,
  WORK_DIRECTION_HINTS_LT,
  PROFESSION_HINTS_LT,
} from "@/lib/structuring/keywords";

/**
 * Guard: a recognised work signal must never surface as a raw English slug in
 * the LT UI (owner round 3 — "Mūrijimas", never "bricklaying").
 *
 * The composer/card resolve a recognised slug to a localized name through
 * `tSkill`/`tProf`, which fall back to the RAW slug only when the locale file
 * has no entry. So the honest guarantee "no raw slug in LT UI" reduces to:
 * every slug the recogniser can emit has an LT name. This guard pins that for
 * the skill, activity and work-direction slug sources.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) =>
  JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as Record<string, string>;

const skillNames = read("messages/lt/skill-names.json");
const professions = read("messages/lt/professions.json");

describe("recogniser skill slugs resolve to an LT name", () => {
  const slugs = [...new Set(SKILL_HINTS_LT.map((h) => h.slug))];
  it.each(slugs)("skill-names.json has '%s'", (slug) => {
    expect(
      typeof skillNames[slug] === "string" && skillNames[slug].trim().length > 0,
      `missing LT name for skill '${slug}' → would render raw slug`,
    ).toBe(true);
  });
});

describe("recogniser profession/activity slugs resolve to an LT name", () => {
  const profSlugs = [
    ...new Set(
      [
        ...ACTIVITY_HINTS_LT.map((a) => a.slug),
        ...WORK_DIRECTION_HINTS_LT.map((d) => d.slug),
        ...PROFESSION_HINTS_LT.map((p) => p.slug),
      ].filter((s): s is string => !!s),
    ),
  ];
  it.each(profSlugs)("professions.json has '%s'", (slug) => {
    expect(
      typeof professions[slug] === "string" &&
        professions[slug].trim().length > 0,
      `missing LT name for profession '${slug}' → would render raw slug`,
    ).toBe(true);
  });
});

describe("activity rows without a profession slug always carry an LT label", () => {
  // A label-only activity row (slug === null) must still give the fragment a
  // human label, otherwise the fragment falls through to "unknown" or a slug.
  it("every label-only ACTIVITY row has a non-empty LT label", () => {
    for (const row of ACTIVITY_HINTS_LT) {
      if (row.slug === null) {
        expect(row.label.trim().length, `empty label for needles ${row.needles[0]}`).toBeGreaterThan(0);
      }
    }
  });
});
