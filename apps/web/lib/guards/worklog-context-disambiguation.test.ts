import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  composeDistinctEngagementLabels,
  composeEngagementLabel,
} from "@/lib/journal/engagement-label";

/**
 * THE WORK-LOG CONTEXT SELECTOR MUST NAME DISTINCT THINGS DISTINCTLY —
 * AND NEVER THE SAME THING TWICE.
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
 * The first fix qualified a repeated base label with its relationship. That
 * produced the second defect (issue #1689, defect J, production
 * HUMAN_ACCEPTANCE FAIL): two org-less employee contexts had the
 * RELATIONSHIP as their base, and the qualifier repeated it —
 *
 *     Darbuotojas — Darbuotojas
 *
 * — while the journal page composed the very same rows a third way. The rule
 * now lives in ONE pure composer (`lib/journal/engagement-label.ts`) used by
 * both surfaces: organization → "Org · Relationship", personal → "Asmeninis
 * įrašas [· title]", a collision qualified by the title, else the start
 * month, never by a word already present; the list pairwise distinct.
 *
 * The composer is unit-tested in `engagement-label.test.ts`. This guard pins
 * the WIRING — that both surfaces actually call it — on the SOURCE, because
 * the two consumers are `server-only` and read the database; the behaviour
 * is proven end to end by `pilot-cross-actor-loop.spec.ts`.
 */
const WEB = join(__dirname, "..", "..");
const SELECTOR = readFileSync(
  join(WEB, "lib", "conversation", "worklog-engagements.ts"),
  "utf8",
);
const JOURNAL_PAGE = readFileSync(
  join(WEB, "app", "[locale]", "dashboard", "journal", "page.tsx"),
  "utf8",
);
const flat = SELECTOR.replace(/\s+/g, " ");

describe("work-log context labels", () => {
  it("NEGATIVE CONTROL: the modules this guard reads are real", () => {
    expect(SELECTOR.length).toBeGreaterThan(2000);
    expect(flat).toContain("export async function listWorkLogEngagements");
    expect(JOURNAL_PAGE.length).toBeGreaterThan(2000);
  });

  it("BOTH surfaces compose labels through the ONE composer", () => {
    for (const [name, src] of [
      ["worklog-engagements.ts", SELECTOR],
      ["journal/page.tsx", JOURNAL_PAGE],
    ] as const) {
      expect(src, name).toContain(
        'import { composeDistinctEngagementLabels } from "@/lib/journal/engagement-label"',
      );
      expect(src, name).toMatch(/composeDistinctEngagementLabels\(/);
    }
  });

  it("the superseded per-surface compositions are gone", () => {
    // The selector's own base label and its "— relationship" qualifier.
    expect(flat).not.toContain("base: orgName ?? e.title ?? canonicalRelationship(e.relationship_slug)");
    expect(flat).not.toMatch(/\$\{base\} — \$\{canonicalRelationship\(e\.relationship_slug\)\}/);
    expect(flat).not.toContain("baseCounts");
    // The page's own three-way template.
    expect(JOURNAL_PAGE).not.toMatch(/`\$\{orgName\} · \$\{tRel\(e\.relationship_slug\)\}`/);
    expect(JOURNAL_PAGE).not.toMatch(/`\$\{t\("personalEntry"\)\} · \$\{personalTitle\}`/);
    expect(JOURNAL_PAGE).not.toContain('?? e.title ?? "—"');
  });

  it("takes the relationship name from the ONE canonical catalogue, with the older wording as fallback", () => {
    // `conversation.worklog.relationship.*` does not carry `student` or
    // `volunteer`, so using it first would print "other" for exactly the
    // education case this exists to disambiguate. The owner once saw a
    // literal "employee" in a Lithuanian dropdown — the fallback chain must
    // survive too.
    expect(flat).toContain('getTranslations("relationshipTypes")');
    expect(flat).toContain("canonicalRelationship");
    expect(flat).toContain("relationshipLabel: canonicalRelationship(e.relationship_slug)");
    expect(flat).toContain("relationshipLabel(slug)");
  });

  it("both surfaces hand the composer the same facts", () => {
    for (const src of [SELECTOR, JOURNAL_PAGE]) {
      for (const field of [
        "orgName:",
        "orgTypeLabel",
        "title:",
        "relationshipLabel:",
        "personalEntryLabel",
        "isPersonal: !org",
        "startedAt:",
      ]) {
        expect(src).toContain(field);
      }
      // The org TYPE label reuses the existing role labels (no new key).
      expect(src).toContain('tRole("company")');
      expect(src).toContain('tRole("agency")');
    }
  });

  it("THE DEFECT, on the composer both surfaces use: base === relationship ⇒ no 'X — X'", () => {
    const rel = "Darbuotojas";
    const twoOrgless = composeDistinctEngagementLabels([
      { orgName: null, orgTypeLabel: null, title: null, relationshipLabel: rel, personalEntryLabel: "Asmeninis darbuotojo įrašas", isPersonal: true, startedAt: "2026-01-10" },
      { orgName: null, orgTypeLabel: null, title: null, relationshipLabel: rel, personalEntryLabel: "Asmeninis darbuotojo įrašas", isPersonal: true, startedAt: "2026-04-02" },
    ]);
    expect(new Set(twoOrgless).size).toBe(2);
    for (const l of twoOrgless) {
      expect(l).not.toContain(`${rel} — ${rel}`);
      expect(l).not.toContain(`${rel} · ${rel}`);
    }
    // And with the relationship as the only fact the composer holds:
    expect(
      composeEngagementLabel({ orgName: null, orgTypeLabel: null, title: null, relationshipLabel: rel, personalEntryLabel: "", isPersonal: false, startedAt: null, needsQualifier: true }),
    ).toBe(rel);
  });

  it("a job and a placement at one organization are still told apart (the 2026-08-27 case)", () => {
    const labels = composeDistinctEngagementLabels([
      { orgName: "Dev Construction", orgTypeLabel: "Įmonė", title: null, relationshipLabel: "Darbuotojas", personalEntryLabel: "Asmeninis darbuotojo įrašas", isPersonal: false, startedAt: null },
      { orgName: "Dev Construction", orgTypeLabel: "Įmonė", title: null, relationshipLabel: "Studentas", personalEntryLabel: "Asmeninis darbuotojo įrašas", isPersonal: false, startedAt: null },
    ]);
    expect(labels).toEqual(["Dev Construction · Darbuotojas", "Dev Construction · Studentas"]);
  });

  it("NEGATIVE CONTROL — the superseded spelling is detectable", () => {
    // A guard that would pass against the old code proves nothing.
    const old = "base: orgName ?? e.title ?? canonicalRelationship(e.relationship_slug),";
    expect(old).toContain("base: orgName ?? e.title ?? canonicalRelationship(e.relationship_slug)");
    expect(`${"Darbuotojas"} — ${"Darbuotojas"}`).toBe("Darbuotojas — Darbuotojas");
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

  it("the personal-entry head exists in every active locale", () => {
    for (const loc of ACTIVE) {
      const j = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "messages", loc, "journal.json"), "utf8"),
      );
      expect(typeof j.personalEntry, `${loc}.journal.personalEntry`).toBe("string");
      expect(String(j.personalEntry).trim().length, `${loc}.journal.personalEntry`).toBeGreaterThan(0);
    }
  });

  it("NEGATIVE CONTROL: the catalogue does not answer for an unknown slug", () => {
    expect(names("lt")["not-a-relationship"]).toBeUndefined();
  });
});
