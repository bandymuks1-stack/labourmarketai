import { describe, expect, it } from "vitest";
import { groupMissingDocumentsByType, type DocumentGapItem } from "./documents-gap";

const item = (documentTypeSlug: string, country: string): DocumentGapItem => ({
  documentTypeSlug,
  country,
  requirementLevel: "required",
  sourceTitle: null,
  sourceUrl: null,
});

/**
 * Production, 2026-09-06 ("kas man trūksta?" as a worker with NO + SE
 * preferences): "Dokumentai: trūksta 4 (Asmens dokumentas, Komandiravimo
 * pranešimas, Asmens dokumentas, Komandiravimo pranešimas)". Four honest
 * rows, one stuttering sentence. The grouping is what the sentence renders.
 */
describe("groupMissingDocumentsByType", () => {
  it("one name per document type, countries collected beside it, first-seen order", () => {
    const grouped = groupMissingDocumentsByType([
      item("identity_document", "NO"),
      item("posting_notification", "NO"),
      item("identity_document", "SE"),
      item("posting_notification", "SE"),
    ]);
    expect(grouped).toEqual([
      { documentTypeSlug: "identity_document", countries: ["NO", "SE"] },
      { documentTypeSlug: "posting_notification", countries: ["NO", "SE"] },
    ]);
  });

  it("caps by TYPE, not by row", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].flatMap((slug) => [item(slug, "NO"), item(slug, "SE")]);
    expect(groupMissingDocumentsByType(rows, 5).map((g) => g.documentTypeSlug)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("a single country is never repeated and an empty list stays empty", () => {
    expect(groupMissingDocumentsByType([item("a1", "DE"), item("a1", "DE")])).toEqual([
      { documentTypeSlug: "a1", countries: ["DE"] },
    ]);
    expect(groupMissingDocumentsByType([])).toEqual([]);
  });
});
