import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the Calendar states temporal reality with the work-world grammar —
 * OBSERVED / COMMITTED / PLANNED / UNKNOWN on every row, and a period record
 * drawn as a DERIVED month band, never as manufactured day items.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: the Calendar states temporal reality (CALENDAR_REACHABLE + PERIOD_DERIVED_NOT_SOURCE)", () => {
  const page = read("app/[locale]/dashboard/planning/page.tsx");
  const derived = read("components/app/planning/derived-period-evidence.tsx");
  const prim = read("components/app/work-world/primitives.tsx");

  it("every calendar row wears ONE temporal-reality chip driven by the one rule", () => {
    expect(page).toContain('from "@/lib/planning/temporal-reality"');
    expect(page).toMatch(/<TimeReality\s+kind=\{temporalReality\(item\)\}/);
    // the conflict flag is a relation between committed rows and stays its own mark
    expect(page).toContain("data-testid={`planning-conflict-${item.id}`}");
  });

  it("observed is cyan evidence, committed is gold, and a plan is never either colour", () => {
    expect(prim).toMatch(/observed:\s*"text-brand-cyan/);
    expect(prim).toMatch(/committed:\s*"text-brand-blue/);
    expect(prim).toMatch(/planned:\s*"text-text-secondary/);
    expect(prim).toMatch(/unknown:\s*"text-text-muted border-dashed/);
    // nothing on the calendar is ever painted as verification
    expect(prim).not.toMatch(/REALITY_CLASS[\s\S]{0,600}trust-accent/);
  });

  it("the month view draws a period record as a DERIVED band with this month emphasised — never as day items", () => {
    expect(page).toMatch(/<DerivedPeriodEvidence month=\{anchor\.slice\(0, 7\)\}/);
    expect(derived).toContain("projectPeriodAggregateByMonth");
    expect(derived).toContain("listMyOrganizationEvidence");
    expect(derived).toMatch(/<TimeReality kind="derived"/);
    expect(derived).toMatch(/activeMonth=\{month\}/);
    expect(derived).toContain('tRecords("monthlyShare")');
    // it never manufactures day rows or planning items out of a period
    expect(derived).not.toMatch(/PlanningItem|startDate|itemsForDay|per[- ]?day|dailyRows/);
    // withdrawn records do not draw
    expect(derived).toMatch(/rec\.withdrawn\) return \[\]/);
  });

  it("the calendar chip labels exist in every active locale that carries the planning namespace", () => {
    for (const loc of ["en", "lt", "ru", "de", "nl"]) {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        planning: { reality: Record<string, string>; derived: Record<string, string> };
      };
      for (const k of ["observed", "derived", "planned", "committed", "conflict", "unknown"]) {
        expect(j.planning.reality[k], `${loc} reality.${k}`).toBeTruthy();
      }
      for (const k of ["title", "chip", "thisMonth", "sourceLink"]) {
        expect(j.planning.derived[k], `${loc} derived.${k}`).toBeTruthy();
      }
      expect(j.planning.derived.thisMonth).toContain("{hours}");
    }
  });
});
