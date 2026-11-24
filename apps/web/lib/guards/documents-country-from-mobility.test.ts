import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = resolve(__dirname, "../..");
const page = readFileSync(
  resolve(WEB, "app/[locale]/dashboard/documents/page.tsx"),
  "utf8",
);

describe("documents country chips lead with the person's own mobility", () => {
  it("reads workers.preferred_countries and only ORDERS the chips", () => {
    expect(page).toMatch(/readMyPreferredCountries\(/);
    expect(page).toMatch(/orderedCountries\.map\(/);
    // The country stays selected only by the person's own ?country= choice:
    // a preference is not a right to work.
    expect(page).toMatch(/sp\.country \?\? ""/);
    expect(page).not.toMatch(/country = myCountries/);
  });

  it("every locale carries documents.country.mine", () => {
    for (const l of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const j = JSON.parse(readFileSync(resolve(WEB, `messages/${l}.json`), "utf8"));
      expect(typeof j.documents.country.mine, l).toBe("string");
    }
  });
});
