import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvEvidenceMix, CvSkillOverview, type CvEvidenceSlice, type CvSkillOverviewRow } from "@/components/app/cv/cv-overview-analytics";
import { deriveHoursLedger, type LedgerLine } from "@/lib/journal/hours-ledger";

const line = (patch: Partial<LedgerLine> & Pick<LedgerLine, "key" | "hours">): LedgerLine => ({
  source: "organization_period", counted: true, from: "2025-01-01", to: "2025-01-10", confirmedHours: 0, ...patch,
});
const mix = (total: number, slices: readonly CvEvidenceSlice[]) => renderToStaticMarkup(createElement(CvEvidenceMix, {
  title: "Hours", total, totalValue: `${total} h`, totalLabel: "Professional experience in total", locale: "en", slices, scope: ["Included records"], action: null,
}));
const slice = (key: CvEvidenceSlice["key"], hours: number): CvEvidenceSlice => ({ key, hours, label: key, value: `${hours} h` });
const skillOverview = (rows: readonly CvSkillOverviewRow[]) => renderToStaticMarkup(createElement(CvSkillOverview, {
  title: "Skills", leftLabel: "Skills", rightLabel: "Work records", basis: "Showing 6 of 7 skills.", attributedLabel: "Attributed",
  activityLabel: "Entry excerpt", locale: "en", action: null, rows,
}));

describe("Living CV overview: evidence, never a person rating", () => {
  it("keeps the secondary composition collapsed until requested", () => {
    const html = mix(100, [slice("actual", 70), slice("confirmed", 30)]);
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("<summary");
    expect(html).toContain('<div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle pb-2 text-meta" data-testid="cv-evidence-total"><span class="text-text-muted">Professional experience in total</span><span class="font-semibold tabular-nums text-text-secondary">100 h</span></div>');
    expect(html.indexOf("100 h")).toBeLessThan(html.indexOf('data-testid="cv-evidence-chart"'));
  });

  it("shows compact labelled bars using the same composition denominator as the legend", () => {
    const html = mix(100, [slice("actual", 25), slice("reported", 75)]);
    expect(html).toContain('data-evidence-state="actual"');
    expect(html).toContain('data-evidence-state="reported"');
    expect(html.match(/data-testid="cv-evidence-share"/g)).toHaveLength(2);
    expect(html.match(/style="width:25%"/g)).toHaveLength(1);
    expect(html.match(/style="width:75%"/g)).toHaveLength(1);
    expect(html).toContain("25%");
    expect(html).toContain("75%");
  });

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

  it("keeps actual work details closed until a skill node is selected", () => {
    const html = skillOverview([{
      key: "welding", name: "Welding", tier: "Recorded", activity: "Fitted steel pipe supports", context: "North site installation",
      attributedHours: null, involvementHours: "Involved in 8 h of work; this skill's part is unknown.", confirmation: null,
      detail: "4 work entries", share: null, shareLabel: null, level: "recorded", connections: [],
    }]);
    expect(html).toContain('data-testid="cv-work-map"');
    expect(html).toContain("Skills");
    expect(html).not.toContain("Work records");
    expect(html).toContain('data-node-id="skill:welding"');
    expect(html).toContain('data-level="recorded"');
    expect(html).not.toContain("Fitted steel pipe supports");
    expect(html).not.toContain("North site installation");
    expect(html).not.toContain("Involved in 8 h");
    expect(html).not.toContain("data-testid=\"cv-work-map-detail\"");
    expect(html).not.toContain("0%");
  });

  it("maps only supplied canonical connections and shows attributed time without tier labels", () => {
    const html = skillOverview([{
      key: "masonry", name: "Masonry", tier: "Recorded", activity: "Built and repaired block walls", context: "Residential renovation",
      attributedHours: "12 h", involvementHours: "Also involved in 4 h not attributed to this skill alone.",
      confirmation: "5 h confirmed by a manager", detail: "3 work entries", share: 0.24, shareLabel: "24%", level: "confirmed",
      connections: [
        { key: "entry-a", label: "Built retaining walls", detail: "Full entry A", meta: "2025" },
        { key: "entry-b", label: "Installed masonry", detail: "Full entry B" },
        { key: "entry-c", label: "Repaired brickwork" },
        { key: "entry-d", label: "Prepared mortar" },
        { key: "entry-e", label: "Prepared foundations" },
        { key: "entry-f", label: "Finished stonework" },
        { key: "entry-g", label: "Excluded seventh record" },
      ],
    }]);
    expect(html).toContain('aria-label="Masonry — 12 h"');
    expect(html).toContain('data-level="confirmed"');
    expect(html).toContain("Built retaining walls");
    expect(html).toContain("Repaired brickwork");
    expect(html).toContain("Prepared foundations");
    expect(html).toContain("Finished stonework");
    expect(html).not.toContain("Excluded seventh record");
    expect(html).toContain('aria-describedby=');
    expect(html).not.toContain("Recorded");
    expect(html).not.toContain("Built and repaired block walls");
    expect(html).not.toContain("Full entry A");
  });

  it("reserves a representative work node for each skill before filling extra samples", () => {
    const row = (key: string, connections: CvSkillOverviewRow["connections"]): CvSkillOverviewRow => ({
      key, name: key, tier: "Recorded", activity: null, context: null, attributedHours: null, involvementHours: null,
      confirmation: null, detail: null, share: null, shareLabel: null, level: "recorded", connections,
    });
    const html = skillOverview([
      row("prolific", [
        { key: "p1", label: "Prolific record 1" },
        { key: "p2", label: "Prolific record 2" },
        { key: "p3", label: "Prolific record 3" },
      ]),
      row("second", [{ key: "s1", label: "Second skill record" }]),
      row("third", [{ key: "t1", label: "Third skill record" }]),
    ]);
    expect(html).toContain('data-node-id="connection:p1"');
    expect(html).toContain('data-node-id="connection:s1"');
    expect(html).toContain('data-node-id="connection:t1"');
    expect(html).toContain('data-node-id="connection:p2"');
    expect(html).toContain('data-node-id="connection:p3"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain("Second skill record");
    expect(html).toContain("Third skill record");
  });

  it("uses theme tokens for the map and collapsed analytics", () => {
    const html = mix(100, [slice("actual", 100)]);
    expect(html).toContain("bg-surface-1/70");
    expect(html).not.toContain("bg-ink-800/40");
    const skills = skillOverview([{
      key: "welding", name: "Welding", tier: "Recorded", activity: null, context: null,
      attributedHours: null, involvementHours: null, confirmation: null, detail: null, share: null, shareLabel: null,
      level: "declared", connections: [],
    }]);
    expect(skills).toContain("bg-surface-1");
    expect(skills).not.toContain("bg-ink-800/40");
    expect(skills).toContain("border-dashed");
  });
});
