import { describe, expect, it } from "vitest";

import { experienceFiguresOf } from "@/lib/journal/experience-figures";

describe("experienceFiguresOf", () => {
  it("no reading → both unknown, never 0", () => {
    expect(experienceFiguresOf(null, null)).toEqual({ organizationHistoryHours: null, professionalExperienceHours: null });
    expect(experienceFiguresOf(undefined, [])).toEqual({ organizationHistoryHours: null, professionalExperienceHours: null });
  });
});
