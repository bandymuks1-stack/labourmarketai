import { describe, expect, it } from "vitest";
import {
  buildCompactSaveFields,
  compactStateFingerprint,
  computeTotalTime,
  deriveCompactRows,
  type CompactActivityRow,
  type CompactSaveInput,
} from "./compact-edit-model";
import type { JournalEditingEntry } from "./edit-entry";

/**
 * Journal compact edit UX (P0) — the pure model behind the compact editor.
 * Pins:
 *   • rows derive from the entry's PERSISTED state (fragments + links),
 *     each activity keeping ITS OWN time;
 *   • the ONE batch-save field map re-submits untouched state unchanged and
 *     ships per-row times as index-paired fragments;
 *   • removed linked-skill rows ride the rejected-slugs lane;
 *   • no payload anywhere can carry fake verification.
 */

const baseEntry: JournalEditingEntry = {
  id: "e1",
  originalText: "1 val vairavau, 3 val kasoje",
  engagementContextId: null,
  workDate: "2026-07-01",
  time: null,
  quantity: null,
  workDirectionSlug: null,
  siteName: null,
  institutionName: null,
  topic: null,
  skillSlugs: [],
  activities: [],
};

const skills = [
  { slug: "driving", name: "Vairavimas" },
  { slug: "tiling", name: "Plytelių klojimas" },
];

describe("deriveCompactRows", () => {
  it("one row per persisted fragment, each with its OWN time", () => {
    const { rows } = deriveCompactRows(
      {
        ...baseEntry,
        activities: [
          {
            index: 1,
            rawPhrase: "1 val vairavau",
            activityLabel: "vairavimas",
            time: { value: 1, unitSlug: "hours" },
            userLabel: null,
          },
          {
            index: 2,
            rawPhrase: "3 val kasoje",
            activityLabel: "kasininko darbas",
            time: { value: 3, unitSlug: "hours" },
            userLabel: null,
          },
        ],
      },
      skills,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("vairavimas");
    expect(rows[0].timeValue).toBe("1");
    expect(rows[1].label).toBe("kasininko darbas");
    expect(rows[1].timeValue).toBe("3");
  });

  it("adds linked skills as rows and merges same-label links into fragments", () => {
    const { rows } = deriveCompactRows(
      {
        ...baseEntry,
        skillSlugs: ["driving", "tiling"],
        activities: [
          {
            index: 1,
            rawPhrase: "klojau",
            activityLabel: "Plytelių klojimas",
            time: { value: 2, unitSlug: "hours" },
            userLabel: null,
          },
        ],
      },
      skills,
    );
    // tiling merged into the fragment row; driving got its own row.
    expect(rows).toHaveLength(2);
    expect(rows[0].skillSlug).toBe("tiling");
    expect(rows[0].timeValue).toBe("2");
    expect(rows[1].skillSlug).toBe("driving");
    expect(rows[1].label).toBe("Vairavimas");
    expect(rows[1].timeValue).toBe("");
  });

  it("global entry time surfaces as looseTime ONLY when no row has its own", () => {
    const withGlobal = deriveCompactRows(
      { ...baseEntry, time: { value: 6, unitSlug: "hours" } },
      skills,
    );
    expect(withGlobal.looseTime).toEqual({ value: 6, unitSlug: "hours" });

    const withRowTimes = deriveCompactRows(
      {
        ...baseEntry,
        time: { value: 6, unitSlug: "hours" },
        activities: [
          {
            index: 1,
            rawPhrase: "a",
            activityLabel: "a",
            time: { value: 6, unitSlug: "hours" },
            userLabel: null,
          },
        ],
      },
      skills,
    );
    expect(withRowTimes.looseTime).toBeNull();
  });

  it("uses the worker clarification label for unknown fragments", () => {
    const { rows } = deriveCompactRows(
      {
        ...baseEntry,
        activities: [
          {
            index: 1,
            rawPhrase: "2 val prie stendo",
            activityLabel: null,
            time: { value: 2, unitSlug: "hours" },
            userLabel: "stendo montavimas",
          },
        ],
      },
      skills,
    );
    expect(rows[0].label).toBe("stendo montavimas");
  });
});

describe("computeTotalTime", () => {
  it("sums mixed units to whole hours when they divide evenly", () => {
    expect(
      computeTotalTime([
        { timeValue: "1", timeUnit: "hours" },
        { timeValue: "120", timeUnit: "minutes" },
      ]),
    ).toEqual({ value: 3, unitSlug: "hours" });
  });
  it("keeps minutes when the total is not whole hours", () => {
    expect(
      computeTotalTime([
        { timeValue: "1", timeUnit: "hours" },
        { timeValue: "20", timeUnit: "minutes" },
      ]),
    ).toEqual({ value: 80, unitSlug: "minutes" });
  });
  it("null when no row has a time", () => {
    expect(computeTotalTime([{ timeValue: "", timeUnit: "hours" }])).toBeNull();
  });
});

function input(overrides: Partial<CompactSaveInput>): CompactSaveInput {
  return {
    text: "tekstas",
    workDate: "2026-07-01",
    engagementContextId: "",
    rows: [],
    removedSkillSlugs: [],
    looseTimeValue: "",
    looseTimeUnit: "hours",
    quantityValue: "",
    quantityUnit: "square_meters",
    directionSlug: "",
    siteName: "",
    institutionName: "",
    topic: "",
    ...overrides,
  };
}

function row(overrides: Partial<CompactActivityRow>): CompactActivityRow {
  return {
    key: "k",
    label: "vairavimas",
    skillSlug: null,
    rawPhrase: null,
    timeValue: "",
    timeUnit: "hours",
    origin: "persisted",
    ...overrides,
  };
}

describe("buildCompactSaveFields — the ONE batch save payload", () => {
  it("several activities keep their OWN times as paired fragment entries", () => {
    const fields = buildCompactSaveFields(
      input({
        rows: [
          row({ key: "a", label: "vairavimas", timeValue: "1", timeUnit: "hours" }),
          row({
            key: "b",
            label: "kasininko darbas",
            timeValue: "30",
            timeUnit: "minutes",
          }),
        ],
      }),
    );
    const fragments = JSON.parse(fields.fragments_json) as Array<{
      rawPhrase: string;
      timeValue: number | null;
      timeUnit: string | null;
      activityLabel: string;
    }>;
    expect(fragments).toHaveLength(2);
    expect(fragments[0]).toMatchObject({
      activityLabel: "vairavimas",
      timeValue: 1,
      timeUnit: "hours",
    });
    expect(fragments[1]).toMatchObject({
      activityLabel: "kasininko darbas",
      timeValue: 30,
      timeUnit: "minutes",
    });
    // The entry-level quantity metric stays the honest total of the rows.
    expect(fields.quantity).toBe("90");
    expect(fields.unit_slug).toBe("minutes");
  });

  it("an added skill lands in the payload (fragments_json)", () => {
    const fields = buildCompactSaveFields(
      input({
        rows: [row({ key: "new", label: "Suvirinimas", origin: "added" })],
      }),
    );
    expect(fields.fragments_json).toContain("Suvirinimas");
  });

  it("a removed linked skill ships via rejected_slugs_json", () => {
    const fields = buildCompactSaveFields(
      input({ removedSkillSlugs: ["tiling", "tiling"] }),
    );
    expect(JSON.parse(fields.rejected_slugs_json)).toEqual(["tiling"]);
  });

  it("text-only edit re-submits untouched metrics unchanged", () => {
    const fields = buildCompactSaveFields(
      input({
        text: "naujas tekstas",
        looseTimeValue: "6",
        looseTimeUnit: "hours",
        directionSlug: "tiler",
        siteName: "Vilnius",
        institutionName: "VDU",
        topic: "renovacija",
      }),
    );
    expect(fields).toMatchObject({
      notes: "naujas tekstas",
      work_date: "2026-07-01",
      quantity: "6",
      unit_slug: "hours",
      work_direction: "tiler",
      site_name: "Vilnius",
      institution_name: "VDU",
      topic: "renovacija",
    });
  });

  it("an explicit non-time quantity wins the quantity metric slot", () => {
    const fields = buildCompactSaveFields(
      input({
        quantityValue: "12",
        quantityUnit: "square_meters",
        rows: [row({ timeValue: "2", timeUnit: "hours" })],
      }),
    );
    expect(fields.quantity).toBe("12");
    expect(fields.unit_slug).toBe("square_meters");
    // Row time still persists per-activity via fragments_json.
    expect(JSON.parse(fields.fragments_json)[0].timeValue).toBe(2);
  });

  it("unit change flows into the payload", () => {
    const fields = buildCompactSaveFields(
      input({ rows: [row({ timeValue: "90", timeUnit: "minutes" })] }),
    );
    expect(JSON.parse(fields.fragments_json)[0].timeUnit).toBe("minutes");
  });

  it("removing a time clears it from the row's fragment entry", () => {
    const fields = buildCompactSaveFields(
      input({ rows: [row({ timeValue: "" })] }),
    );
    expect(JSON.parse(fields.fragments_json)[0].timeValue).toBeNull();
    expect(fields.quantity).toBeUndefined();
  });

  it("never emits verification fields anywhere", () => {
    const fields = buildCompactSaveFields(
      input({
        rows: [row({ timeValue: "2" }), row({ key: "b", origin: "added" })],
        removedSkillSlugs: ["x"],
      }),
    );
    const s = JSON.stringify(fields);
    expect(s).not.toMatch(/verified/i);
    expect(s).not.toMatch(/manager_confirmed/i);
  });

  it("re-sends the entry's engagement so an edit never reassigns the org", () => {
    const fields = buildCompactSaveFields(
      input({ engagementContextId: "eng-agency-b" }),
    );
    expect(fields.engagement_context_id).toBe("eng-agency-b");
  });

  it("omits engagement only when there is none (legacy entry)", () => {
    const fields = buildCompactSaveFields(input({ engagementContextId: "" }));
    expect(fields.engagement_context_id).toBeUndefined();
  });
});

describe("compactStateFingerprint — dirty detection", () => {
  it("changing the engagement flips the fingerprint (dirty)", () => {
    expect(
      compactStateFingerprint(input({ engagementContextId: "a" })),
    ).not.toBe(compactStateFingerprint(input({ engagementContextId: "b" })));
  });
  it("identical state → identical fingerprint (cancel changes nothing)", () => {
    expect(compactStateFingerprint(input({}))).toBe(
      compactStateFingerprint(input({})),
    );
  });
  it("a row time change flips the fingerprint", () => {
    expect(
      compactStateFingerprint(input({ rows: [row({ timeValue: "2" })] })),
    ).not.toBe(compactStateFingerprint(input({ rows: [row({})] })));
  });
});
