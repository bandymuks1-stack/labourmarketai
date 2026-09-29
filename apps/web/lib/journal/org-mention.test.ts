import { describe, expect, it } from "vitest";

import { distinctiveWords, mentionsOrganization } from "@/lib/journal/org-mention";

/**
 * Walked on production 2026-09-29: "Šiandien 5 valandas betonavau pamatus
 * Alfa objekte." by a worker whose Alfa relationship had ended — the card
 * preselected Gama, their only active organization. The card now reads which
 * of the person's own organizations the sentence names.
 */
describe("which organization did the sentence name", () => {
  it("finds a named organization, through Lithuanian case endings", () => {
    expect(mentionsOrganization("Šiandien 5 valandas betonavau pamatus Alfa objekte.", "QA-SYNTHETIC Alfa (testinis subjektas)")).toBe(true);
    expect(mentionsOrganization("Dirbau Alfoje 6 val.", "UAB Alfa")).toBe(true);
    expect(mentionsOrganization("Montavau pastolius Baumeister objekte", "Baumeister GmbH")).toBe(true);
  });

  it("NEGATIVE: legal forms, markers and lowercase words never name an organization", () => {
    expect(mentionsOrganization("Šiandien 5 valandas betonavau pamatus.", "QA-SYNTHETIC Gama (testinis subjektas)")).toBe(false);
    expect(mentionsOrganization("Dirbau gamyboje 8 val.", "UAB Gama")).toBe(false);
    expect(mentionsOrganization("[QA-SYNTHETIC] dirbau 5 val.", "QA-SYNTHETIC Gama")).toBe(false);
    expect(distinctiveWords("UAB Statybų grupė")).toEqual(["statybu", "grupe"]);
  });
});
