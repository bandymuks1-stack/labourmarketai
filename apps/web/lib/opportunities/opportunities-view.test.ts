import { describe, expect, it } from "vitest";

import {
  SUBJECT_SIDE_MISSING_DATA,
  bandOfStatus,
  countByBand,
  deriveWorldReading,
  groupRowsByBand,
  isDiscoveryOnly,
  nonEmptyBands,
  readStrongBand,
  retrievalCounts,
  selectReadbackRows,
  whyCodesFor,
} from "./opportunities-view";
import { FIT_BAND_ORDER, type FitBand } from "./fit-band";
import type { MatchMissingDataCode } from "@/lib/market/match-v1";

/**
 * OPPORTUNITIES VIEW — pure grouping behind the PASAULIS destination and
 * the chat readback (#1689, defect H).
 *
 * NEGATIVE CONTROLS at the end: a `not_assessed` row can never land in the
 * STRONG or POSSIBLE section or in a readback; a reader failure yields
 * "could not read", never an empty STRONG band.
 */

const row = (
  band: FitBand,
  missingDataCodes: readonly MatchMissingDataCode[] = [],
  gapCodes: readonly string[] = [],
) => ({ key: `${band}-${Math.random()}`, band, missingDataCodes, gapCodes });

describe("sections follow the band order and drop empty bands", () => {
  it("orders strongest first, UNKNOWN last, and keeps input order inside a band", () => {
    const a = { ...row("possible"), key: "a" };
    const b = { ...row("not_assessed"), key: "b" };
    const c = { ...row("strong"), key: "c" };
    const d = { ...row("possible"), key: "d" };
    const e = { ...row("conflict"), key: "e" };
    const sections = groupRowsByBand([a, b, c, d, e]);
    expect(sections.map((s) => s.band)).toEqual(["strong", "possible", "conflict", "not_assessed"]);
    expect(sections[1].rows.map((r) => r.key)).toEqual(["a", "d"]);
  });

  it("an empty input yields no sections at all", () => {
    expect(groupRowsByBand([])).toEqual([]);
  });

  it("counts every band, including zeroes — and a sentence lists only the non-empty ones, in order", () => {
    const counts = countByBand([row("conflict"), row("strong"), row("strong")]);
    expect(counts).toEqual({
      strong: 2,
      possible: 0,
      missing_requirement: 0,
      conflict: 1,
      not_assessed: 0,
    });
    expect(nonEmptyBands(counts)).toEqual(["strong", "conflict"]);
    expect(nonEmptyBands(countByBand([]))).toEqual([]);
  });
});

describe("discovery-only is a claim about rows that exist", () => {
  it("true only when rows exist and none is an assessed fit", () => {
    expect(isDiscoveryOnly([row("not_assessed"), row("missing_requirement")])).toBe(true);
    expect(isDiscoveryOnly([row("not_assessed"), row("possible")])).toBe(false);
    expect(isDiscoveryOnly([])).toBe(false);
  });
});

describe("the STRONG band is read honestly", () => {
  it("no rows at all → nothing retrieved, not an empty band", () => {
    expect(readStrongBand([])).toEqual({ kind: "nothing_retrieved" });
  });

  it("rows with a strong one → rows with the count", () => {
    expect(readStrongBand([row("strong"), row("possible"), row("strong")])).toEqual({
      kind: "rows",
      count: 2,
    });
  });

  it("rows, none strong → empty, naming ONLY subject-side codes the engine reported", () => {
    const r = readStrongBand([
      row("not_assessed", ["need_not_structured", "pay_unknown"]),
      row("missing_requirement", ["location_unknown", "need_recognized_not_confirmed"]),
      row("conflict", ["pay_unknown"]),
    ]);
    expect(r).toEqual({
      kind: "empty",
      subjectMissing: ["location_unknown", "pay_unknown"],
    });
  });

  it("rows, none strong, nothing missing on the person's side → empty with nothing to name (never invented)", () => {
    expect(readStrongBand([row("possible"), row("conflict", ["need_not_structured"])])).toEqual({
      kind: "empty",
      subjectMissing: [],
    });
  });

  it("the subject-side list holds no demand-side code", () => {
    for (const demandSide of ["need_not_structured", "need_recognized_not_confirmed", "language_requirement_unknown"]) {
      expect(SUBJECT_SIDE_MISSING_DATA).not.toContain(demandSide);
    }
  });
});

describe("WHY codes and retrieval counts", () => {
  it("gaps first, then unknowns, then profile gaps — de-duplicated, order kept", () => {
    expect(
      whyCodesFor({
        gapCodes: ["skills_missing", "country_mismatch"],
        missingDataCodes: ["pay_unknown", "pay_unknown"],
        profileGapCodes: ["country_mismatch", "no_documents"],
      }),
    ).toEqual(["skills_missing", "country_mismatch", "pay_unknown", "no_documents"]);
  });

  it("retrieved vs shown never goes negative and shown never exceeds retrieved", () => {
    expect(retrievalCounts(20, 5)).toEqual({ retrieved: 20, shown: 5, withheld: 15 });
    expect(retrievalCounts(3, 3)).toEqual({ retrieved: 3, shown: 3, withheld: 0 });
    expect(retrievalCounts(2, 7)).toEqual({ retrieved: 2, shown: 2, withheld: 0 });
  });

  it("a status-only recommendation gets the same band derivation as an external row", () => {
    expect(bandOfStatus("strong")).toBe("strong");
    expect(bandOfStatus("possible")).toBe("possible");
    // `weak` without the engine's own eligibility word is a missing
    // requirement — a conflict is never claimed on a status alone.
    expect(bandOfStatus("weak")).toBe("missing_requirement");
    expect(bandOfStatus("insufficient_data")).toBe("not_assessed");
    expect(bandOfStatus(null)).toBe("not_assessed");
    expect(bandOfStatus(undefined)).toBe("not_assessed");
  });
});

describe("NEGATIVE CONTROL — a found posting is not a suitable one", () => {
  it("a not_assessed row can never land in the STRONG or POSSIBLE section", () => {
    const rows = [row("not_assessed"), row("not_assessed", ["need_not_structured"]), row("missing_requirement")];
    for (const s of groupRowsByBand(rows)) {
      if (s.band === "strong" || s.band === "possible") {
        throw new Error(`unassessed rows landed in ${s.band}`);
      }
    }
    expect(groupRowsByBand(rows).map((s) => s.band)).toEqual(["missing_requirement", "not_assessed"]);
  });

  it("a readback shows STRONG first, then POSSIBLE, at most three — and never any other band", () => {
    const rows = [
      { ...row("not_assessed"), key: "u1" },
      { ...row("possible"), key: "p1" },
      { ...row("conflict"), key: "c1" },
      { ...row("strong"), key: "s1" },
      { ...row("missing_requirement"), key: "m1" },
      { ...row("possible"), key: "p2" },
      { ...row("strong"), key: "s2" },
    ];
    expect(selectReadbackRows(rows).map((r) => r.key)).toEqual(["s1", "s2", "p1"]);
    expect(selectReadbackRows(rows, 5).map((r) => r.key)).toEqual(["s1", "s2", "p1", "p2"]);
    // Discovery-only: nothing to read back as a fit.
    expect(selectReadbackRows([row("not_assessed"), row("conflict")])).toEqual([]);
  });

  it("a reader failure is 'could not read', never an empty STRONG band", () => {
    const failed = deriveWorldReading({ subject: "unreadable", rows: [row("strong")] });
    expect(failed).toEqual({ kind: "could_not_read_subject" });
    const empty = deriveWorldReading({ subject: "ready", rows: [] });
    expect(empty).toMatchObject({ kind: "bands", sections: [], strong: { kind: "nothing_retrieved" } });
    expect(FIT_BAND_ORDER[FIT_BAND_ORDER.length - 1]).toBe("not_assessed");
  });

  it("a discovery-only world says so and still explains every row", () => {
    const reading = deriveWorldReading({
      subject: "ready",
      rows: [row("not_assessed", ["need_not_structured"]), row("missing_requirement", ["pay_unknown"], ["skills_missing"])],
    });
    if (reading.kind !== "bands") throw new Error("expected bands");
    expect(reading.discoveryOnly).toBe(true);
    expect(reading.strong).toEqual({ kind: "empty", subjectMissing: ["pay_unknown"] });
    expect(reading.sections.map((s) => s.band)).toEqual(["missing_requirement", "not_assessed"]);
  });
});
