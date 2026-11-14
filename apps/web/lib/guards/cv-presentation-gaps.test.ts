import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * CV audit 2026-11-13, presentation gaps. Each pin is one place where the CV
 * said something it had not measured, or printed an internal value:
 *   - "0 h confirmed" for a figure that could not be read;
 *   - the part of an e-mail address before "@" printed as the person's name;
 *   - a unit's stored code instead of its name;
 *   - education with no word on whose statement it is;
 *   - three "0" counters on a CV that has nothing to count yet.
 */
const web = join(__dirname, "..", "..");
const page = readFileSync(join(web, "app/[locale]/cv/page.tsx"), "utf8");
const builder = readFileSync(join(web, "lib/cv-export/verified-cv.ts"), "utf8");

describe("CV presentation gaps", () => {
  it("an unread confirmed figure is an em dash, never zero", () => {
    expect(page).not.toMatch(/recordedHoursConfirmed \?\? 0/);
    expect(page).toMatch(/cv\.recordedHoursConfirmed === null\s+\? "—"\s+: fmtHours\(cv\.recordedHoursConfirmed\)/);
  });

  it("no part of an e-mail address is printed as a name", () => {
    expect(builder).toMatch(/const personName = profileRes\.data\?\.full_name\?\.trim\(\) \|\| "—";/);
    expect(builder).not.toMatch(/email\.split\("@"\)/);
    // The page turns "—" into the "name not provided" sentence.
    expect(page).toContain('data-testid="cv-name-missing"');
  });

  it("a unit is named through the shared catalogue", () => {
    expect(page).toContain('getTranslations("productivityUnits")');
    expect(page).toMatch(/tUnits\.has\(o\.unit as never\) \? tUnits\(o\.unit as never\) : o\.unit/);
  });

  it("education says whose statement it is, in every active locale", () => {
    expect(page).toContain('t("educationSelfStated")');
    for (const locale of activeLocales) {
      const m = JSON.parse(readFileSync(join(web, "messages", `${locale}.json`), "utf8"));
      expect(m?.cvExport?.educationSelfStated, locale).toBeTruthy();
    }
  });

  it("a CV with nothing to count shows no zero counters; an unread value keeps them", () => {
    expect(page).toMatch(/const summaryHasFigures = summary\.some\(\(s\) => s\.value !== 0\);/);
    expect(page).toMatch(/\{!summaryHasFigures \? null : !compact \? \(/);
  });
});
