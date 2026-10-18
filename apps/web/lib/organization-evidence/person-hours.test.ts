import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { personHoursOf } from "./person-hours";
import type { EvidenceRecordView } from "./import-core";

const rec = (over: Partial<EvidenceRecordView>): EvidenceRecordView =>
  ({ activityDate: null, periodStart: null, periodEnd: null, hours: null, ...over }) as EvidenceRecordView;

describe("personHoursOf - day hours and period aggregates are never summed", () => {
  it("14.5 h of single days + a 965 h period aggregate stay two figures (never 979.5)", () => {
    const h = personHoursOf([
      rec({ activityDate: "2025-03-10", hours: 8 }),
      rec({ activityDate: "2025-03-11", hours: 6.5 }),
      rec({ periodStart: "2025-01-01", periodEnd: "2025-06-30", hours: 800 }),
      rec({ periodStart: "2025-07-01", periodEnd: "2025-07-31", hours: 165 }),
    ]);
    expect(h).toEqual({ count: 4, dayHours: 14.5, periodHours: 965 });
  });

  it("a person with only a period aggregate has 0 day hours", () => {
    expect(personHoursOf([rec({ periodStart: "2025-01-01", periodEnd: "2025-01-31", hours: 800 })])).toEqual({ count: 1, dayHours: 0, periodHours: 800 });
  });

  it("an unstated duration is not zero-filled into a total (it contributes nothing)", () => {
    expect(personHoursOf([rec({ activityDate: "2025-03-10", hours: null })])).toEqual({ count: 1, dayHours: 0, periodHours: 0 });
  });
});

describe("the 'who performed this work' panel renders them apart", () => {
  const src = readFileSync(join(process.cwd(), "components/app/organization/performing-company-panel.tsx"), "utf8");
  it("uses personHoursOf and never adds r.hours itself", () => {
    expect(src).toMatch(/personHoursOf\(/);
    expect(src).not.toMatch(/\.hours\s*\+=\s*r\.hours/);
    expect(src).toMatch(/data-testid="performing-company-period"/);
  });
});
