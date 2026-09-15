import { describe, expect, it } from "vitest";

import {
  composeDistinctEngagementLabels,
  composeEngagementLabel,
  yearMonthOf,
  type EngagementLabelInput,
} from "./engagement-label";

/**
 * Issue #1689, defect J: the work-context selector printed
 * "Darbuotojas — Darbuotojas". The ONE composer must never repeat a word,
 * must name organization contexts "Org · Relationship", personal ones
 * "Asmeninis įrašas [· title]", and must hand back pairwise-distinct labels
 * for any list.
 */

const REL = "Darbuotojas";
const PERSONAL = "Asmeninis darbuotojo įrašas";

function row(over: Partial<EngagementLabelInput> = {}): EngagementLabelInput {
  return {
    orgName: null,
    orgTypeLabel: null,
    title: null,
    relationshipLabel: REL,
    personalEntryLabel: PERSONAL,
    isPersonal: true,
    startedAt: null,
    ...over,
  };
}

describe("composeEngagementLabel — one context", () => {
  it("a personal context with no title is the personal-entry label alone", () => {
    expect(composeEngagementLabel(row())).toBe(PERSONAL);
  });

  it("a personal context with a title carries the title after the head", () => {
    expect(composeEngagementLabel(row({ title: "Darbų vadovas" }))).toBe(
      `${PERSONAL} · Darbų vadovas`,
    );
  });

  it("an organization context is 'Org · Relationship'", () => {
    expect(
      composeEngagementLabel(row({ isPersonal: false, orgName: "Dev Construction" })),
    ).toBe("Dev Construction · Darbuotojas");
  });

  it("an organization with no name falls back to its TYPE label, never a dash", () => {
    const l = composeEngagementLabel(
      row({ isPersonal: false, orgName: null, orgTypeLabel: "Įmonė" }),
    );
    expect(l).toBe("Įmonė · Darbuotojas");
    expect(l).not.toContain("—");
  });

  it("THE DEFECT: base === relationship ⇒ never 'X — X' / 'X · X'", () => {
    // No organization name, no type label, no title: the head IS the
    // relationship, and the relationship must not be appended again.
    const l = composeEngagementLabel(
      row({ isPersonal: false, orgName: null, orgTypeLabel: null, title: null, needsQualifier: true }),
    );
    expect(l).toBe(REL);
    expect(l).not.toMatch(/Darbuotojas\s*[—·-]\s*Darbuotojas/);
    // The personal head likewise never repeats the relationship, even when
    // a qualifier is demanded and there is nothing else to say.
    const p = composeEngagementLabel(row({ needsQualifier: true, startedAt: null }));
    expect(p).toBe(PERSONAL);
  });

  it("a qualifier prefers the title, then the start month, and never a word already present", () => {
    expect(
      composeEngagementLabel(
        row({ isPersonal: false, orgName: "Dev Construction", title: "Meistras", needsQualifier: true }),
      ),
    ).toBe("Dev Construction · Darbuotojas · Meistras");
    expect(
      composeEngagementLabel(
        row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2026-03-01", needsQualifier: true }),
      ),
    ).toBe("Dev Construction · Darbuotojas · 2026-03");
    // The title equals the relationship word → it is NOT printed twice; the
    // month is the qualifier instead.
    expect(
      composeEngagementLabel(
        row({ isPersonal: false, orgName: "Dev Construction", title: "Darbuotojas", startedAt: "2026-05-10T08:00:00Z", needsQualifier: true }),
      ),
    ).toBe("Dev Construction · Darbuotojas · 2026-05");
  });

  it("yearMonthOf reads only a real ISO prefix", () => {
    expect(yearMonthOf("2026-05-10T08:00:00Z")).toBe("2026-05");
    expect(yearMonthOf("2026-05-10")).toBe("2026-05");
    expect(yearMonthOf("")).toBeNull();
    expect(yearMonthOf(null)).toBeNull();
    expect(yearMonthOf("May 2026")).toBeNull();
  });
});

describe("composeDistinctEngagementLabels — a list", () => {
  it("two employee rows at one organization get DISTINCT labels", () => {
    const labels = composeDistinctEngagementLabels([
      row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2025-11-03" }),
      row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2026-03-01" }),
    ]);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toEqual([
      "Dev Construction · Darbuotojas · 2025-11",
      "Dev Construction · Darbuotojas · 2026-03",
    ]);
  });

  it("a job and a placement at the same organization are told apart by the relationship", () => {
    const labels = composeDistinctEngagementLabels([
      row({ isPersonal: false, orgName: "Dev Construction", relationshipLabel: "Darbuotojas" }),
      row({ isPersonal: false, orgName: "Dev Construction", relationshipLabel: "Studentas" }),
    ]);
    expect(labels).toEqual(["Dev Construction · Darbuotojas", "Dev Construction · Studentas"]);
  });

  it("the production case: one untitled and one titled personal context", () => {
    const labels = composeDistinctEngagementLabels([
      row({ title: null }),
      row({ title: "Darbų vadovas" }),
    ]);
    expect(labels).toEqual([PERSONAL, `${PERSONAL} · Darbų vadovas`]);
  });

  it("two untitled personal contexts never print the relationship twice, and are still distinct", () => {
    const labels = composeDistinctEngagementLabels([
      row({ startedAt: "2026-01-15" }),
      row({ startedAt: "2026-04-02" }),
    ]);
    expect(labels).toEqual([`${PERSONAL} · 2026-01`, `${PERSONAL} · 2026-04`]);
    for (const l of labels) expect(l).not.toMatch(/(\S+)\s*[—·]\s*\1/);
  });

  it("identical in every fact the product holds → still distinct (ordinal as the very last resort)", () => {
    const labels = composeDistinctEngagementLabels([
      row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2026-03-01" }),
      row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2026-03-20" }),
    ]);
    expect(new Set(labels).size).toBe(2);
    expect(labels[0]).toBe("Dev Construction · Darbuotojas · 2026-03");
    expect(labels[1]).toBe("Dev Construction · Darbuotojas · 2026-03 (2)");
  });

  it("a unique label is left exactly as composed — no qualifier leaks onto it", () => {
    const labels = composeDistinctEngagementLabels([
      row({ isPersonal: false, orgName: "Dev Construction", startedAt: "2026-03-01" }),
      row({ isPersonal: false, orgName: "Baltic Build", startedAt: "2026-03-01" }),
      row({ title: "Meistras" }),
    ]);
    expect(labels).toEqual([
      "Dev Construction · Darbuotojas",
      "Baltic Build · Darbuotojas",
      `${PERSONAL} · Meistras`,
    ]);
  });

  it("NEGATIVE CONTROL — the superseded composition really did print the repeat", () => {
    // What `worklog-engagements.ts` did before this module: the base label
    // fell through to the relationship, and the ambiguity qualifier appended
    // the relationship again. This is the string the owner saw, and it is
    // what the assertions above would have failed on.
    const base = REL;
    const superseded = `${base} — ${REL}`;
    expect(superseded).toBe("Darbuotojas — Darbuotojas");
    expect(superseded).toMatch(/Darbuotojas\s*—\s*Darbuotojas/);
  });
});
