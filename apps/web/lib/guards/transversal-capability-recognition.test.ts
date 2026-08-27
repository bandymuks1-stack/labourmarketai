import { describe, expect, it } from "vitest";
import { deriveJournalRecognition } from "@/lib/journal/journal-recognition";
import { SKILL_HINTS_LT } from "@/lib/structuring/keywords";

/**
 * A STUDENT'S EVIDENCE IS NOT TILING.
 *
 * ── WHAT WAS MEASURED (2026-08-27, before this family existed) ─────────────
 * The catalogue held 153 skills and exactly ONE was professional rather than
 * occupational. The owner's own example sentence produced NOTHING:
 *
 *   "Susitikau su svietimo ir politikos atstovais, pristaciau projekta ir
 *    aptariau bendradarbiavimo galimybes"
 *     → recognized [] · candidates [] · claims [] · 3 of 3 fragments unresolved
 *
 * while "Klojau plyteles ir daziau sienas" resolved cleanly to tiling +
 * painting. The recognition ENGINE was never the problem — it fragments,
 * matches and reports coverage honestly, and it never silently lost anything
 * (`silentlyLostFragmentCount` stayed 0 throughout). The VOCABULARY was the
 * problem: it could see trades and nothing else.
 *
 * That is the education pilot's real blocker. A student's evidence is
 * projects, presentations, teamwork, volunteering and competitions. Without
 * this family the flywheel (journal → evidence → skills → Living CV →
 * matching) runs for a construction worker and hands a student an empty CV —
 * the "person with no experience" verdict the product exists to refuse.
 *
 * ── WHAT THIS GUARD PINS ───────────────────────────────────────────────────
 * The owner's sentence, in both languages, resolving to the capabilities the
 * owner named — AND the trade recogniser continuing to behave exactly as
 * before, because a vocabulary that grows by breaking what worked is not a fix.
 */

const TRANSVERSAL = [
  "presenting",
  "stakeholder-engagement",
  "partnership-development",
  "negotiation",
  "project-coordination",
  "report-writing",
  "teamwork",
  "research",
] as const;

const EMPTY = {
  declaredSlugs: new Set<string>(),
  entryRejections: { slugs: new Set<string>(), claimLabels: new Set<string>() },
};

function recognize(text: string): string[] {
  return deriveJournalRecognition(text, EMPTY)
    .recognizedSkills.map((s) => s.slug)
    .sort();
}

function coverage(text: string) {
  return deriveJournalRecognition(text, EMPTY).coverage;
}

const OWNER_EN =
  "Met with education and political representatives to present the project and explore cooperation opportunities";
const OWNER_LT =
  "Susitikau su svietimo ir politikos atstovais, pristaciau projekta ir aptariau bendradarbiavimo galimybes";

describe("the owner's example produces the capabilities it describes", () => {
  it("English — presenting, stakeholder engagement, partnership development", () => {
    const got = recognize(OWNER_EN);
    expect(got).toContain("presenting");
    expect(got).toContain("stakeholder-engagement");
    expect(got).toContain("partnership-development");
  });

  it("Lithuanian — the same three", () => {
    const got = recognize(OWNER_LT);
    expect(got).toContain("presenting");
    expect(got).toContain("stakeholder-engagement");
    expect(got).toContain("partnership-development");
  });

  it("nothing in the sentence is left unread, in either language", () => {
    // The measured regression this replaces: 3 of 3 fragments unresolved.
    for (const text of [OWNER_EN, OWNER_LT]) {
      const c = coverage(text);
      expect(c.unresolvedFragmentCount, `unresolved in: ${text}`).toBe(0);
      expect(c.silentlyLostFragmentCount).toBe(0);
    }
  });

  it("a student's university project is readable evidence", () => {
    const got = recognize(
      "Built a university team project: wrote the report and presented it to the panel",
    );
    expect(got).toContain("teamwork");
    expect(got).toContain("report-writing");
    expect(got).toContain("presenting");
  });
});

describe("the trade recogniser is untouched", () => {
  it("manual work still resolves exactly as before", () => {
    expect(recognize("Klojau plyteles vonioje ir daziau sienas")).toEqual([
      "painting",
      "tiling",
    ]);
  });

  it("a trade sentence gains NO transversal capability by accident", () => {
    // The false-positive risk this family introduces: an EXACT needle match
    // becomes a real (unverified, yellow-confidence) worker_skills row, so a
    // loose needle would manufacture a capability nobody claimed.
    const capabilities = new Set<string>(TRANSVERSAL);
    for (const text of [
      "Klojau plyteles vonioje ir daziau sienas",
      "Muriju sienas ir betonuoju pamatus",
      "Vairavau krautuva sandelyje",
      "Gaminau maista virtuveje",
    ]) {
      for (const slug of recognize(text)) {
        expect(
          capabilities.has(slug),
          `"${text}" wrongly produced capability "${slug}"`,
        ).toBe(false);
      }
    }
  });
});

describe("participation is not a leadership claim", () => {
  // Found by browser E2E, not by reading code: the student case produced
  // `team-coordination` instead of `teamwork`, because that role's needle was
  // the bare stem "komand" and matched every form of the word. So a student
  // writing "universiteto KOMANDINIS projektas" — I took part in a team
  // project — was credited with COORDINATING a team. That is a skill the
  // person never claimed, which is the fabricated-skill failure doctrine §7
  // forbids, and it would have gone onto their CV.
  it("taking part in a team project is teamwork, never team coordination", () => {
    const got = recognize(
      "Universiteto komandinis projektas: parasiau ataskaita ir pristaciau ji komisijai",
    );
    expect(got).toContain("teamwork");
    expect(
      got,
      "participation was credited as team COORDINATION — a leadership claim",
    ).not.toContain("team-coordination");
  });

  it("actually leading a team is still recognised as coordination", () => {
    // The narrowing must not delete the role — only stop it over-reaching.
    const got = recognize("Koordinavau komanda statybvieteje ir vadovavau brigadai");
    expect(got).toContain("team-coordination");
  });
});

describe("the family is wired into the one catalogue", () => {
  it("every capability is a real hint row tagged cross-sector", () => {
    for (const slug of TRANSVERSAL) {
      const rows = SKILL_HINTS_LT.filter((h) => h.slug === slug);
      expect(rows.length, `no hint row for '${slug}'`).toBeGreaterThan(0);
      for (const r of rows) {
        // The SkillHintRow type doc already reserves "other" for cross-sector
        // transferable abilities — this family populates the existing design
        // rather than inventing a new sector.
        expect(r.sector, `'${slug}' is not cross-sector`).toBe("other");
        expect(r.needles.length).toBeGreaterThan(0);
      }
    }
  });
});
