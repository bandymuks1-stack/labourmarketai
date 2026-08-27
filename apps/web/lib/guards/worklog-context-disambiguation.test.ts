import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE WORK-LOG CONTEXT SELECTOR MUST NAME DISTINCT THINGS DISTINCTLY.
 *
 * Found by the cross-actor loop E2E on 2026-08-27, and caused by making
 * multi-role real: once a learner could hold BOTH `employee` and `student`
 * engagements with the same organization, `listWorkLogEngagements` labelled
 * both rows with the organization name alone. The selector offered
 *
 *     Pasirinkite darbo kontekstą…
 *     Darbuotojas
 *     Dev Construction
 *     Dev Construction      ← the placement, indistinguishable from the job
 *
 * and the flow — correctly — refuses to save until one is chosen. So the
 * person is asked a question they have no way to answer, and the journal is
 * evidence: filing work against the wrong relationship is a false statement,
 * not a cosmetic slip.
 *
 * The rule this guards: a base label that occurs more than once is qualified
 * by its relationship; a unique one is left exactly as it was.
 *
 * Asserted on the SOURCE because the function is `server-only` and reads the
 * database — the behaviour is proven end to end by
 * `pilot-cross-actor-loop.spec.ts`, and this keeps the rule from being
 * silently deleted in a refactor.
 */
const SOURCE = readFileSync(
  join(__dirname, "..", "conversation", "worklog-engagements.ts"),
  "utf8",
);
const flat = SOURCE.replace(/\s+/g, " ");

describe("work-log context labels", () => {
  it("NEGATIVE CONTROL: the module this guard reads is real", () => {
    expect(SOURCE.length).toBeGreaterThan(2000);
    expect(flat).toContain("export async function listWorkLogEngagements");
  });

  it("counts base labels so a repeat can be detected at all", () => {
    expect(flat).toContain("baseCounts");
    expect(flat).toMatch(/baseCounts\.set\(base, \(baseCounts\.get\(base\) \?\? 0\) \+ 1\)/);
  });

  it("qualifies ONLY the ambiguous label, never every label", () => {
    // The qualification must be conditional. An unconditional suffix would
    // rename every context in the product — including the single-context case
    // that reads correctly today.
    expect(flat).toContain("const ambiguous = (baseCounts.get(base) ?? 0) > 1");
    expect(flat).toMatch(
      /ambiguous \? `\$\{base\} — \$\{canonicalRelationship\(e\.relationship_slug\)\}` : base/,
    );
  });

  it("takes the relationship name from the ONE canonical catalogue", () => {
    // `conversation.worklog.relationship.*` does not carry `student` or
    // `volunteer`, so using it here would print "other" for exactly the
    // education case this exists to disambiguate.
    expect(flat).toContain('getTranslations("relationshipTypes")');
    expect(flat).toContain("canonicalRelationship");
  });

  it("still falls back rather than printing a raw slug", () => {
    // The owner once saw a literal "employee" in a Lithuanian dropdown. The
    // fallback chain must survive.
    expect(flat).toContain("relationshipLabel(slug)");
    expect(flat).toContain("relationshipLabel(e.relationship_slug)");
  });
});

describe("the canonical catalogue can actually name a placement", () => {
  const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
  const names = (loc: string) =>
    JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "messages", loc, "relationship-types.json"),
        "utf8",
      ),
    );

  it("names every relationship the selector can offer, in every active locale", () => {
    // PROFESSIONAL_HISTORY_RELATIONSHIPS is what the selector filters on.
    for (const loc of ACTIVE) {
      const n = names(loc);
      for (const slug of [
        "employee",
        "freelancer",
        "consultant",
        "collaborator",
        "student",
        "volunteer",
      ]) {
        expect(
          typeof n[slug] === "string" && n[slug].trim() !== "",
          `${loc}: relationship-types.json cannot name "${slug}"`,
        ).toBe(true);
      }
    }
  });

  it("NEGATIVE CONTROL: the catalogue does not answer for an unknown slug", () => {
    expect(names("lt")["not-a-relationship"]).toBeUndefined();
  });
});
