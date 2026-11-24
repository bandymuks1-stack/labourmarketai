import { describe, expect, it } from "vitest";

import {
  FIT_BAND_ORDER,
  deriveFitBand,
  isAssessedFit,
  type FitBand,
} from "./fit-band";
import type { MatchStatus } from "@/lib/market/match-v1";

/**
 * FIT BAND — a found posting is not a suitable one (#1689, defect H).
 *
 * Total over the engine's four statuses; every band is explained by the
 * engine's own codes; nothing here invents a verdict.
 *
 * NEGATIVE CONTROL: the production failure was `insufficient_data` and
 * `weak` rows rendered under a "jobs that fit you" heading. The last block
 * pins that neither status can ever land in an assessed band.
 */

const gap = (code: string) => ({ code }) as never;
const crit = (criterion: string) =>
  ({ criterion, class: "hard", outcome: "failed", source: "t" }) as never;

describe("total over MatchStatus", () => {
  const STATUSES: readonly MatchStatus[] = ["strong", "possible", "weak", "insufficient_data"];
  it("every status maps to exactly one band, and the status is carried through untouched", () => {
    for (const status of STATUSES) {
      const r = deriveFitBand({ status, eligible: true, gaps: [], missingData: [], blocking: [] });
      expect(FIT_BAND_ORDER).toContain(r.band);
      expect(r.status).toBe(status);
    }
  });

  it("strong → strong, possible → possible (with an empty why — nothing to explain)", () => {
    expect(deriveFitBand({ status: "strong", eligible: true })).toMatchObject({
      band: "strong",
      why: { gapCodes: [], missingDataCodes: [], blockingCriteria: [] },
    });
    expect(deriveFitBand({ status: "possible", eligible: true }).band).toBe("possible");
  });

  it("insufficient_data → not_assessed, with the missing-data codes as the why", () => {
    const r = deriveFitBand({
      status: "insufficient_data",
      eligible: false,
      missingData: ["need_not_structured"],
      gaps: [],
      blocking: [],
    });
    expect(r.band).toBe("not_assessed");
    expect(r.why.missingDataCodes).toEqual(["need_not_structured"]);
  });

  it("weak + a failed hard criterion → conflict, naming the criterion", () => {
    const r = deriveFitBand({
      status: "weak",
      eligible: false,
      gaps: [gap("country_mismatch")],
      missingData: [],
      blocking: [crit("country_location")],
    });
    expect(r.band).toBe("conflict");
    expect(r.why.blockingCriteria).toEqual(["country_location"]);
    expect(r.why.gapCodes).toEqual(["country_mismatch"]);
  });

  it("weak, not eligible, even without a recorded blocking row → conflict (the engine's own word)", () => {
    expect(deriveFitBand({ status: "weak", eligible: false, gaps: [gap("language_missing")] }).band).toBe(
      "conflict",
    );
  });

  it("weak + eligible with gaps → missing_requirement, the gaps as the why", () => {
    const r = deriveFitBand({
      status: "weak",
      eligible: true,
      gaps: [gap("skills_missing")],
      missingData: [],
      blocking: [],
    });
    expect(r.band).toBe("missing_requirement");
    expect(r.why.gapCodes).toEqual(["skills_missing"]);
  });
});

describe("a card with no engine verdict is NOT ASSESSED — never guessed into a band", () => {
  it("null / undefined / an empty object all read as not_assessed", () => {
    for (const input of [null, undefined, {}]) {
      const r = deriveFitBand(input as never);
      expect(r.band).toBe("not_assessed");
      expect(r.status).toBe("insufficient_data");
      expect(r.why).toEqual({ gapCodes: [], missingDataCodes: [], blockingCriteria: [] });
    }
  });

  it("an unknown status string is not_assessed, not a crash and not 'strong'", () => {
    expect(deriveFitBand({ status: "excellent" as never }).band).toBe("not_assessed");
  });
});

describe("NEGATIVE CONTROL — the production defect cannot recur", () => {
  it("neither weak nor insufficient_data is ever an assessed fit", () => {
    const weak = deriveFitBand({ status: "weak", eligible: true, gaps: [gap("skills_missing")] });
    const unread = deriveFitBand({ status: "insufficient_data", missingData: ["need_not_structured"] });
    expect(isAssessedFit(weak.band)).toBe(false);
    expect(isAssessedFit(unread.band)).toBe(false);
    // …and the two assessed bands are exactly the engine's two fitting verdicts
    const assessed = FIT_BAND_ORDER.filter(isAssessedFit);
    expect(assessed).toEqual<FitBand[]>(["strong", "possible"]);
  });

  it("the band order lists the unknown band LAST — not-assessed is not a verdict", () => {
    expect(FIT_BAND_ORDER[FIT_BAND_ORDER.length - 1]).toBe("not_assessed");
  });
});
