/**
 * IT "administrator" compounds are not office administrators (production
 * /lt/jobs, 2026-10-25): NAV ads with the occupation label
 * "Systemadministrator" were headed "Biuro administratorius", because the
 * bare needle "administrator" matched inside the compound. The catalogue
 * has no IT-operations profession, so the honest answer is no profession
 * (the card keeps the publisher's own title), never the wrong trade.
 */
import { describe, expect, it } from "vitest";

import { detectNeedProfession } from "@/lib/market/need-skills";
import { extractProfileSuggestions } from "@/lib/structuring/extract-profile-suggestions";

import { categorizeVacancy } from "./vacancy-categorization";

describe("IT administrator compounds stay out of office_administrator", () => {
  const IT: readonly string[] = [
    "Systemadministrator",
    "Systemadministratör",
    "Nettverksadministrator",
    "Netzwerkadministrator",
    "Database administrator",
    "Datenbankadministrator",
    "IT-administrator",
    "Системный администратор",
    "Sistemų administratorius",
    "Administrator systemów IT",
  ];

  it.each(IT)("%s → no office_administrator", (label) => {
    const r = categorizeVacancy({ titleRaw: label, descriptionRaw: "", occupationRaw: label });
    expect(r.professionSlug).not.toBe("office_administrator");
    expect(detectNeedProfession(label)).not.toBe("office_administrator");
    expect(extractProfileSuggestions(`Dirbu: ${label}`).professionSlugs).not.toContain("office_administrator");
  });

  it("a plain administrator is still an office administrator", () => {
    for (const label of ["Administrator", "Kontoradministrator", "Администратор офиса"]) {
      expect(detectNeedProfession(label)).toBe("office_administrator");
    }
  });
});
