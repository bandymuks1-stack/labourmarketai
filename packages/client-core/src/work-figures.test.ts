import { describe, expect, it } from "vitest";

import {
  dominantSkill,
  formatHours,
  formatShare,
  periodFigures,
  presentProfileSkills,
  PROFILE_SKILL_GROUP_ORDER,
  type LivingCvSkillRow,
  type WorkSkillFigures,
} from "./work-figures";

/**
 * The phone shows the reader's figures in the web's order. These tests pin
 * that ORDER and the honesty states; the figures themselves are the
 * server's (the reader has its own suites in apps/web).
 */

function skill(slug: string, attributedHours: number, entries: number, share = 0): WorkSkillFigures {
  return {
    slug,
    attributedHours,
    confirmedHours: 0,
    sharedHours: 0,
    share,
    entries,
    days: entries,
    contexts: 1,
    firstWorkedDay: null,
    lastWorkedDay: null,
    trend: "none",
  };
}

function row(skillId: string, slug: string | null, verified: boolean, source: string | null): LivingCvSkillRow {
  return { skillId, slug, verified, source };
}

describe("periodFigures", () => {
  it("returns the server's row for the key, and null — not an empty row — when it is absent", () => {
    const periods = [
      { key: "today", startIso: "2026-09-13", endIso: "2026-09-13", hours: 2, confirmedHours: 0, dayUnits: 0, entries: 1, daysWorked: 1 },
      { key: "week", startIso: "2026-09-07", endIso: "2026-09-13", hours: 9.5, confirmedHours: 4, dayUnits: 0, entries: 3, daysWorked: 2 },
    ];
    expect(periodFigures({ periods }, "week")!.hours).toBe(9.5);
    expect(periodFigures({ periods }, "month")).toBeNull();
  });
});

describe("dominantSkill — the largest share of attributed hours, or null", () => {
  it("picks the skill with the largest share", () => {
    const s = dominantSkill([skill("tiling", 6, 2, 0.6), skill("plastering", 4, 1, 0.4)]);
    expect(s!.slug).toBe("tiling");
  });
  it("involvement alone is not a share: a skill with shared hours but no attributed hours is never dominant", () => {
    const shared = { ...skill("welding", 0, 3, 0), sharedHours: 8 };
    expect(dominantSkill([shared])).toBeNull();
  });
  it("declared-only skills (0 h) yield null, never a 0 % 'dominant' skill", () => {
    expect(dominantSkill([skill("tiling", 0, 0, 0)])).toBeNull();
    expect(dominantSkill([])).toBeNull();
  });
});

describe("presentProfileSkills — the web's order: confirmed → journal-backed → declared, then hours, then entries", () => {
  const rows = [
    row("s-paint", "painting", false, null),
    row("s-tiling", "tiling", true, "manager_confirmed"),
    row("s-plaster", "plastering", false, "work_journal"),
    row("s-weld", "welding", false, null),
    row("s-idle", "cooking", false, null),
  ];
  const figures = [
    skill("painting", 12, 4, 0.5), // declared row, but the journal attributes hours → journal-backed
    skill("tiling", 6, 2, 0.25),
    skill("plastering", 1, 1, 0.05),
    skill("welding", 0, 0),
  ];

  it("groups by the recorded fact and orders the groups strongest first", () => {
    const p = presentProfileSkills(rows, figures);
    expect(p.groups.map((g) => g.key)).toEqual(["manager_confirmed", "journal_backed", "declared"]);
    expect(PROFILE_SKILL_GROUP_ORDER).toEqual(["manager_confirmed", "journal_backed", "declared"]);
    expect(p.groups[0]!.items.map((i) => i.slug)).toEqual(["tiling"]);
    // within journal-backed: 12 h before 1 h — the row with more hours leads
    expect(p.groups[1]!.items.map((i) => i.slug)).toEqual(["painting", "plastering"]);
    expect(p.groups[2]!.items.map((i) => i.slug)).toEqual(["welding", "cooking"]);
    expect(p.figuresReadable).toBe(true);
    expect(p.selfStatedMissing).toBe(true);
  });

  it("a verified row leads even with fewer hours than a journal-backed one", () => {
    const p = presentProfileSkills(rows, figures);
    const first = p.groups[0]!.items[0]!;
    expect(first.verified).toBe(true);
    expect(first.figures!.attributedHours).toBe(6);
    expect(p.groups[1]!.items[0]!.figures!.attributedHours).toBe(12);
  });

  it("carries hours · share · entries per skill, untouched", () => {
    const p = presentProfileSkills(rows, figures);
    const painting = p.groups[1]!.items[0]!;
    expect(painting.figures).toMatchObject({ attributedHours: 12, share: 0.5, entries: 4 });
    const welding = p.groups[2]!.items[0]!;
    expect(welding.figures).toMatchObject({ attributedHours: 0, entries: 0 });
  });

  it("UNKNOWN ≠ ZERO: when the figures could not be read, no item carries a figure and the presentation says so", () => {
    const p = presentProfileSkills(rows, null);
    expect(p.figuresReadable).toBe(false);
    for (const g of p.groups) for (const i of g.items) expect(i.figures).toBeNull();
    // the stored facts still order: verified first, journal source second
    expect(p.groups.map((g) => g.key)).toEqual(["manager_confirmed", "journal_backed", "declared"]);
    expect(p.groups[1]!.items.map((i) => i.slug)).toEqual(["plastering"]);
    expect(p.groups[2]!.items.map((i) => i.slug)).toEqual(["painting", "welding", "cooking"]);
  });

  it("two rows for one slug stay two rows — the client merges nothing", () => {
    const p = presentProfileSkills([row("a", "tiling", false, null), row("b", "tiling", false, null)], []);
    expect(p.groups[0]!.items).toHaveLength(2);
  });

  it("a row without a slug is shown as declared with no figures", () => {
    const p = presentProfileSkills([row("x", null, false, null)], figures);
    expect(p.groups).toEqual([
      { key: "declared", items: [{ skillId: "x", slug: null, verified: false, source: null, figures: null }] },
    ]);
  });
});

describe("formatting never turns a real figure into none", () => {
  it("hours", () => {
    expect(formatHours(6)).toBe("6");
    expect(formatHours(6.5)).toBe("6.5");
    expect(formatHours(6.25)).toBe("6.3");
    expect(formatHours(0)).toBe("0");
    expect(formatHours(0.04)).toBe("<0.1");
  });
  it("shares", () => {
    expect(formatShare(0.6)).toBe("60%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(0.004)).toBe("<1%");
  });
});
