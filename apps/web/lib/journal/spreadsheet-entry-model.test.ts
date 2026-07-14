import { describe, expect, it } from "vitest";
import {
  SPREADSHEET_MAX_ROWS,
  SPREADSHEET_UNIT_OPTIONS,
  buildSpreadsheetRowPayload,
  emptySpreadsheetRow,
  spreadsheetRowIsEmpty,
  validateSpreadsheetRow,
  type SpreadsheetRowDraft,
} from "./spreadsheet-entry-model";

const base = (over: Partial<SpreadsheetRowDraft> = {}): SpreadsheetRowDraft => ({
  ...emptySpreadsheetRow("2026-07-14", "eng-1"),
  text: "Klojau plyteles vonioje",
  ...over,
});

describe("spreadsheet row validation", () => {
  it("accepts a plain text-only row", () => {
    expect(validateSpreadsheetRow(base())).toEqual([]);
  });
  it("requires text, a valid ISO day and an engagement", () => {
    expect(validateSpreadsheetRow(base({ text: "  " }))).toContain(
      "text_required",
    );
    expect(validateSpreadsheetRow(base({ workDate: "14.07.2026" }))).toContain(
      "date_invalid",
    );
    expect(validateSpreadsheetRow(base({ engagementId: "" }))).toContain(
      "engagement_required",
    );
  });
  it("rejects non-numeric / non-positive quantity and out-of-range hours", () => {
    expect(validateSpreadsheetRow(base({ quantity: "abc" }))).toContain(
      "quantity_invalid",
    );
    expect(validateSpreadsheetRow(base({ quantity: "-3" }))).toContain(
      "quantity_invalid",
    );
    expect(validateSpreadsheetRow(base({ hours: "25" }))).toContain(
      "hours_invalid",
    );
    expect(validateSpreadsheetRow(base({ hours: "0" }))).toContain(
      "hours_invalid",
    );
  });
  it("accepts comma decimals (LT keyboard reality)", () => {
    expect(validateSpreadsheetRow(base({ quantity: "12,5", hours: "7,5" }))).toEqual(
      [],
    );
  });
});

describe("row → ONE createJournalEntry payload mapping", () => {
  it("text-only row maps to notes + work_date + engagement (no metrics)", () => {
    const p = buildSpreadsheetRowPayload(base());
    expect(p).toEqual({
      engagement_context_id: "eng-1",
      notes: "Klojau plyteles vonioje",
      work_date: "2026-07-14",
    });
  });
  it("note is appended to the evidence text, never dropped", () => {
    const p = buildSpreadsheetRowPayload(base({ note: "3 aukštas" }));
    expect(p.notes).toBe("Klojau plyteles vonioje\n3 aukštas");
  });
  it("quantity rides the quantity metric with the registry unit slug", () => {
    const p = buildSpreadsheetRowPayload(
      base({ quantity: "12,5", unitSlug: "square_meters" }),
    );
    expect(p.quantity).toBe("12.5");
    expect(p.unit_slug).toBe("square_meters");
    expect(p.fragments_json).toBeUndefined();
  });
  it("hours-only rides the quantity metric as unit hours (composer parity)", () => {
    const p = buildSpreadsheetRowPayload(base({ hours: "7,5" }));
    expect(p.quantity).toBe("7.5");
    expect(p.unit_slug).toBe("hours");
  });
  it("quantity AND hours: hours persist as ONE fragment_time metric row", () => {
    const p = buildSpreadsheetRowPayload(
      base({ quantity: "40", unitSlug: "square_meters", hours: "8" }),
    );
    expect(p.quantity).toBe("40");
    expect(p.unit_slug).toBe("square_meters");
    const fragments = JSON.parse(p.fragments_json ?? "[]");
    expect(fragments).toEqual([
      {
        rawPhrase: "Klojau plyteles vonioje",
        timeValue: 8,
        timeUnit: "hours",
      },
    ]);
  });
});

describe("bulk bounds + empty-row skipping", () => {
  it("empty rows are detectable so the batch skips them silently", () => {
    expect(spreadsheetRowIsEmpty(emptySpreadsheetRow("2026-07-14", "eng-1"))).toBe(
      true,
    );
    expect(spreadsheetRowIsEmpty(base())).toBe(false);
  });
  it("batch is bounded and units come from the registry subset only", () => {
    expect(SPREADSHEET_MAX_ROWS).toBeLessThanOrEqual(15);
    // Same slugs the composer offers — the §15 registry subset, no invention.
    expect([...SPREADSHEET_UNIT_OPTIONS]).toEqual([
      "hours",
      "minutes",
      "days",
      "square_meters",
      "meters",
      "pieces",
      "kilograms",
      "packages",
    ]);
  });
});
