import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/work-history-2025-part3.staged.json";
import {
  placeSegments,
  resolveRowContexts,
  sessionPlaces,
  type WorkContexts,
} from "./import-core";

/**
 * THE OWNER'S REAL IMPORT, ANONYMISED — `work_history_2025_part3.xlsx` as it
 * sits staged in production (session 47627d4a…, 2026-09-16): 158 rows, 7
 * people, 8 source weeks, the same composite cells, the same typos in the
 * same positions, the same per-place hour figures, the same 800 h / 165 h
 * rows. Names are `Person A…G`; streets are synthetic families carrying the
 * ORIGINAL edit distances (`Testgraht 13` is to `Testgracht 13` what the
 * source's typo was to its street). Nothing here is a real address.
 *
 * The test runs exactly what `buildPreview` runs, minus the database: the
 * session's places, then every row's contexts, against an organization
 * that holds NO objects — which is production's state.
 */

type Staged = {
  readonly row_index: number;
  readonly person_label: string;
  readonly context_label: string | null;
  readonly activity_date: string;
  readonly hours: number | null;
  readonly activity_text: string;
  readonly assignment_note: string;
  readonly week_conflict: boolean;
};

const staged = fixture as readonly Staged[];
const NO_OBJECTS: { id: string; name: string }[] = [];

function previewContexts(objects = NO_OBJECTS) {
  const { canonical, knownAll } = sessionPlaces(staged as unknown as Record<string, unknown>[], objects);
  const rows = staged.map((s) => ({
    row: s,
    contexts: resolveRowContexts({
      contextLabel: s.context_label,
      activityText: s.activity_text,
      hours: s.hours,
      prior: null,
      rowChosenObjectId: null,
      objects,
      knownAll,
      canonical,
    }),
  }));
  return { canonical, rows };
}

describe("the real file, against an empty organization", () => {
  const { canonical, rows } = previewContexts();

  it("158 rows in, 158 readings out; every row that stated a place has one", () => {
    expect(rows).toHaveLength(158);
    for (const { row, contexts } of rows) {
      if (row.context_label !== null) expect(contexts, row.context_label).not.toBeNull();
    }
  });

  it("no composite object is ever proposed — the 37 cell labels become ~17 places", () => {
    const names = canonical.map((c) => c.name);
    for (const n of names) expect(n).not.toContain(";");
    expect(names.length).toBeGreaterThanOrEqual(15);
    expect(names.length).toBeLessThanOrEqual(19);
    expect(names).toEqual(expect.arrayContaining(["Testgracht 3", "Testgracht 5", "Testgracht 1", "Testgracht 13", "Kantoor", "Kruisweg 19", "Zijgang 12"]));
  });

  it("an activity and a duration note in the object column never become places", () => {
    const names = canonical.map((c) => c.name.toLowerCase());
    expect(names.some((n) => n.includes("koordinavimo"))).toBe(false);
    expect(names.some((n) => n.includes("garantie"))).toBe(false);
    const activityRow = rows.find((r) => r.row.context_label === "Administraciniai/koordinavimo darbai")!;
    expect(activityRow.contexts?.segments[0].kind).toBe("activity");
    expect(activityRow.contexts?.segments[0].state).toBe("none");
    expect(placeSegments(activityRow.contexts)).toHaveLength(0);
  });

  it("different house numbers on one street are different places, typos are not", () => {
    const h13 = canonical.find((c) => c.name === "Testgracht 13")!;
    expect(h13.spellings.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Testgraht 13", "Testraht 13"]),
    );
    expect(canonical.find((c) => c.name === "Testgracht 3")!.spellings.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Testgraht 3", "Tesgracht3"]),
    );
    expect(canonical.some((c) => c.name === "Testgraht 13")).toBe(false);
    // Source spelling survives on the row even when folded.
    const typoRow = rows.find((r) => r.row.context_label === null && r.row.activity_text.startsWith("Testgraht 13"))!;
    const seg = placeSegments(typoRow.contexts)[0];
    expect(seg.label).toBe("Testgraht 13");
    expect(seg.name).toBe("Testgracht 13");
    expect(seg.method).toBe("typo_same_house_number");
  });

  it("the 23 rows with an empty cell get their site from the text — except the one that names none", () => {
    const empty = rows.filter((r) => r.row.context_label === null);
    expect(empty).toHaveLength(23);
    const found = empty.filter((r) => placeSegments(r.contexts).length > 0);
    const unknown = empty.filter((r) => placeSegments(r.contexts).length === 0);
    for (const r of found) expect(r.contexts?.method).toBe("site_from_work_text");
    // "Person A" as its own work text, and the two rows naming only a town
    // no other row knows — UNKNOWN stays UNKNOWN, never a guess.
    expect(unknown.map((r) => r.row.activity_text.split(" ")[0]).sort()).toEqual(["Person", "Zaandorp", "Zaandorp"]);
    expect(found.length).toBe(20);
  });

  it("the cell's spelling wins over the text's, whatever the frequency", () => {
    // The correct spelling is in ONE cell; a typo of it opens THREE texts.
    const right = canonical.find((c) => c.name === "Vera Voorbeeldlaan 16");
    expect(right).toBeDefined();
    expect(canonical.some((c) => c.name === "Vera Voorbeeldlin 16")).toBe(false);
    const typoRows = rows.filter((r) => r.row.activity_text.startsWith("Vera Voorbeeldlin 16"));
    expect(typoRows.length).toBe(3);
    for (const r of typoRows) {
      const places = placeSegments(r.contexts);
      expect(places).toHaveLength(1);
      expect(places[0].name).toBe("Vera Voorbeeldlaan 16");
    }
  });

  it("a street too far from any spelling is a NEW place, not silently merged", () => {
    const r = rows.find((x) => x.row.activity_text.startsWith("Testdienst 13"))!;
    const seg = placeSegments(r.contexts)[0];
    expect(seg.state).toBe("new");
    expect(seg.name).toBe("Testdienst 13");
  });

  it("multi-place days: the total is never divided; stated figures are read", () => {
    // An EMPTY cell whose text names two places with their hours.
    const sevenTwo = rows.find(
      (r) => r.row.context_label === null && r.row.activity_text.includes("(7 uur)") && r.row.activity_text.includes("(2 uur)"),
    )!;
    expect(sevenTwo.contexts?.method).toBe("site_from_work_text");
    expect(placeSegments(sevenTwo.contexts).map((p) => p.name)).toEqual(["Testgracht 13", "Testgracht 3"]);
    expect(sevenTwo.contexts?.allocation).toEqual({ method: "explicit_in_text", hours: [7, 2], consistent: true });
    expect(placeSegments(sevenTwo.contexts).map((p) => p.hours)).toEqual([7, 2]);

    const unknownSplit = rows.filter((r) => r.contexts?.allocation?.method === "unknown_split");
    expect(unknownSplit.length).toBeGreaterThanOrEqual(25);
    for (const r of unknownSplit) {
      for (const p of placeSegments(r.contexts)) expect(p.hours).toBeNull();
    }
    // The source's own note agrees with the reading on every row it marks.
    const noted = rows.filter((r) => r.row.assignment_note === "keli objektai - paskirstyta apytiksliai");
    expect(noted.length).toBe(61);
    // Two SEGMENTS at least — but not always two places: `Kruisweg 19;
    // Kruisweg` is one place written twice, and `Zijgang 12; Administraciniai/
    // koordinavimo darbai` is a place and an activity. The source's note says
    // "several objects"; the reading says what they are.
    for (const r of noted) expect(r.contexts?.segments.length).toBeGreaterThanOrEqual(2);
    const onePlace = noted.filter((r) => placeSegments(r.contexts).length === 1);
    for (const r of onePlace) {
      expect(r.row.context_label).toMatch(/Kruisweg 19; Kruisweg|koordinavimo/);
    }
    const single = rows.filter((r) => r.row.assignment_note === "vienas objektas" && r.row.context_label && !r.row.context_label.includes("koordinavimo") && !r.row.context_label.includes("garantie"));
    for (const r of single) expect(r.contexts?.allocation?.method).toBe("single_place");
  });

  it("every place segment carries a method and a confidence below 1 unless exact", () => {
    for (const { contexts } of rows) {
      for (const p of placeSegments(contexts)) {
        if (p.state === "ambiguous") continue;
        expect(p.method).toBeTruthy();
        expect(p.confidence).not.toBeNull();
        if (p.method !== "exact_label") expect(p.confidence as number).toBeLessThan(1);
      }
    }
  });
});

describe("the same file, once the organization holds its objects", () => {
  it("every cell place resolves to an existing object and nothing is proposed for creation", () => {
    const first = previewContexts();
    const objects = first.canonical.map((c, i) => ({ id: `obj-${i}`, name: c.name }));
    const second = previewContexts(objects);
    expect(second.canonical.every((c) => c.existing !== null)).toBe(true);
    const newSegments = second.rows.flatMap((r) => placeSegments(r.contexts).filter((p) => p.state === "new"));
    expect(newSegments).toHaveLength(0);
    for (const r of second.rows) {
      for (const p of placeSegments(r.contexts)) expect(p.workObjectId).toMatch(/^obj-/);
    }
  });

  it("a human's label-level choice survives re-resolution", () => {
    const { canonical, knownAll } = sessionPlaces(staged as unknown as Record<string, unknown>[], NO_OBJECTS);
    const row = staged.find((s) => s.context_label === "Testgracht 3; Kantoor")!;
    const base = resolveRowContexts({
      contextLabel: row.context_label, activityText: row.activity_text, hours: row.hours,
      prior: null, rowChosenObjectId: null, objects: NO_OBJECTS, knownAll, canonical,
    })!;
    const prior: WorkContexts = {
      ...base,
      segments: base.segments.map((s) =>
        s.key === "kantoor" ? { ...s, state: "ignored", method: "human_choice", confidence: 1 } : s,
      ),
    };
    const again = resolveRowContexts({
      contextLabel: row.context_label, activityText: row.activity_text, hours: row.hours,
      prior, rowChosenObjectId: null, objects: NO_OBJECTS, knownAll, canonical,
    })!;
    expect(again.segments.find((s) => s.key === "kantoor")?.state).toBe("ignored");
    expect(placeSegments(again)).toHaveLength(1);
    expect(again.allocation?.method).toBe("single_place");
  });
});
