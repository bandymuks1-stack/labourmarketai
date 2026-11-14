import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import { JOB_DESCRIPTION_MAX, jobPageDescription } from "./job-page-description";

describe("jobPageDescription", () => {
  it("two different ads of the same profession get different descriptions", () => {
    const a = jobPageDescription({ locale: "en", title: "Welder", chips: ["Permanent", "Full-time"], published: "3 Nov 2026" });
    const b = jobPageDescription({ locale: "en", title: "Welder", chips: ["Temporary", "Part-time"], published: "5 Nov 2026" });
    expect(a).not.toBe(b);
    expect(a).toBe("Welder — Permanent · Full-time. Published 3 Nov 2026. Sign in to see the employer, place and how to apply.");
  });

  it("always fits a search result and keeps the sign-in line, in every locale", () => {
    const long = Array.from({ length: 8 }, (_, i) => `a fairly long fact chip number ${i}`);
    for (const locale of activeLocales) {
      const s = jobPageDescription({ locale, title: "Heavy equipment operator", chips: long, published: "30 November 2026" });
      expect(s.length, locale).toBeLessThanOrEqual(JOB_DESCRIPTION_MAX);
      expect(s.endsWith(".")).toBe(true);
    }
  });

  it("works with no chips and no date", () => {
    expect(jobPageDescription({ locale: "lt", title: "Virėjas", chips: [], published: null })).toBe(
      "Virėjas. Prisijunk ir matysi darbdavį, vietą ir kaip kandidatuoti.",
    );
  });
});
