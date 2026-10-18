import { describe, expect, it } from "vitest";
import { humanBookingNote, previousAgreedTerms } from "./booking-note";

describe("booking note provenance", () => {
  it("drops the legacy system string, in any case, but keeps a human note", () => {
    expect(humanBookingNote("Agency candidate offer accepted")).toBeNull();
    expect(humanBookingNote("  agency candidate offer accepted ")).toBeNull();
    expect(humanBookingNote("Atvykite 7:00 prie vartų")).toBe("Atvykite 7:00 prie vartų");
    // A human note that merely CONTAINS the phrase is the person's own words.
    expect(humanBookingNote("Agency candidate offer accepted - please bring boots")).toBe(
      "Agency candidate offer accepted - please bring boots",
    );
    expect(humanBookingNote(null)).toBeNull();
    expect(humanBookingNote("   ")).toBeNull();
  });

  it("previous terms with no date at all are not a fact", () => {
    expect(previousAgreedTerms({ startDate: null, expectedEndDate: null })).toBeNull();
    expect(previousAgreedTerms(null)).toBeNull();
    expect(previousAgreedTerms({ startDate: "2026-10-01", expectedEndDate: null })).toEqual({
      startDate: "2026-10-01",
      expectedEndDate: null,
    });
  });
});
