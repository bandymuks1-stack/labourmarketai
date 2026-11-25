import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvEvidenceMix, CvSkillOverview, type CvEvidenceSlice } from "@/components/app/cv/cv-overview-analytics";
import { deriveHoursLedger, type LedgerLine } from "@/lib/journal/hours-ledger";

const line = (patch: Partial<LedgerLine> & Pick<LedgerLine, "key" | "hours">): LedgerLine => ({
  source: "organization_period", counted: true, from: "2025-01-01", to: "2025-01-10", confirmedHours: 0, ...patch,
});
const mix = (total: number, slices: readonly CvEvidenceSlice[]) => renderToStaticMarkup(createElement(CvEvidenceMix, {
  title: "Hours", total, locale: "en", slices, scope: ["Included records"], action: null,
}));
const slice = (key: CvEvidenceSlice["key"], hours: number): CvEvidenceSlice => ({ key, hours, label: key, value: `${hours} h` });

describe("Living CV overview: evidence, never a person rating", () => {
  it("uses the capacity-adjusted ledger and counts confirmed hours only once", () => {
    const ledger = deriveHoursLedger({ lines: [
      line({ key: "journal", source: "journal", hours: 80, confirmedHours: 40 }),
      line({ key: "period", hours: 150 }),
    ] });
    expect(ledger.total).toBe(160);
    const html = mix(ledger.total, Object.entries(ledger.byState).map(([key, hours]) => slice(key as CvEvidenceSlice["key"], hours)));
    expect(html).toContain('data-evidence-state="confirmed"');
    expect(html).toContain('stroke-dasharray="25 75"');
    expect(html).toContain('data-evidence-state="reported"');
    expect(html).toContain('stroke-dasharray="50 50"');
    expect(html).not.toContain("150 h");
  });

  it("uses the same denominator for arcs and percentages when state rounding differs", () => {
    const html = mix(1, [slice("actual", 0.51), slice("confirmed", 0.51)]);
    expect(html.match(/stroke-dasharray="50 50"/g)).toHaveLength(2);
    expect(html.match(/>50%<\/span>/g)).toHaveLength(2);
    expect(html).not.toContain("51%");
  });

  it.each([
    [0, [slice("actual", 0)]],
    [100, [slice("actual", 70), slice("confirmed", 40)]],
    [100, [slice("actual", 100), slice("reported", -1)]],
    [100, [slice("actual", 100), slice("estimated", Number.NaN)]],
  ])("does not draw an unavailable, invalid or overlapping composition (%s)", (total, slices) => {
    expect(mix(total as number, slices as CvEvidenceSlice[])).toBe("");
  });

  it("does not turn unattributed or unknown skill time into a score or zero", () => {
    const html = renderToStaticMarkup(createElement(CvSkillOverview, {
      title: "Skills", basis: null, action: null,
      rows: [{ key: "welding", name: "Welding", tier: "Recorded", value: "8 h involved, not attributed", detail: null, share: null, shareLabel: null }],
    }));
    expect(html).toContain("8 h involved, not attributed");
    expect(html).not.toContain("cv-skill-time-share");
    expect(html).not.toContain("0%");
  });
});
