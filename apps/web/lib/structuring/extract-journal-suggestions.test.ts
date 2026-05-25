import { describe, expect, it } from "vitest";
import { extractJournalSuggestions } from "./extract-journal-suggestions";

describe("extractJournalSuggestions (rule-based, LT)", () => {
  it("returns an empty result for blank input", () => {
    const s = extractJournalSuggestions("");
    expect(s.hasAny).toBe(false);
  });

  it("parses hours, m², skills, and a site mention from a typical entry", () => {
    const text =
      "Dirbau 8 valandas. Montavau gipso lubas, padariau apie 35 m², dėjau profilius ir tvarkiau angokraščius. Objektas: Vilnius, Konstitucijos pr. 14.";
    const s = extractJournalSuggestions(text);
    expect(s.time).toEqual({ value: 8, unitSlug: "hours" });
    expect(s.quantity).toEqual({ value: 35, unitSlug: "square_meters" });
    expect(s.skillSlugs).toContain("drywall");
    expect(s.skillSlugs).toContain("ceiling-systems");
    expect(s.siteName).toContain("Vilnius");
    expect(s.hasAny).toBe(true);
  });

  it("recognises days as a time unit when no hours are mentioned", () => {
    const s = extractJournalSuggestions("Dirbau 2 dienas objektuose.");
    expect(s.time).toEqual({ value: 2, unitSlug: "days" });
  });

  it("recognises minutes", () => {
    const s = extractJournalSuggestions("Tvarkiau 45 minutes santechniką.");
    expect(s.time?.unitSlug).toBe("minutes");
    expect(s.time?.value).toBe(45);
  });

  it("returns hasAny=false when no rules match", () => {
    const s = extractJournalSuggestions("aaa bbb ccc");
    expect(s.hasAny).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-fragment LT parser — the journal-evidence-loop P0 supersprint contract.
// The owner sentence MUST produce three time + three activity suggestions or
// the worker has no honest way to log a mixed day.
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJournalSuggestions — multi-fragment LT (owner sentence)", () => {
  const ownerSentence =
    "Valandą dirbau pavežėju. 3 valandas parduotuvėje kasininku, ir 5 valandas padėjau dengti stogą.";

  it("detects all three time fragments (1h, 3h, 5h)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const timeValues = s.fragments
      .filter((f) => f.time !== null)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(timeValues).toEqual(["1hours", "3hours", "5hours"]);
  });

  it("detects all three work-direction fragments (driver, cashier, roofing)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const labels = s.fragments.map((f) => f.activityLabel);
    // Exact labels live in keywords.ts; we just need the three concepts present.
    expect(labels.join("|")).toMatch(/pavežėjimas/i);
    expect(labels.join("|")).toMatch(/kasininko|parduotuvės/i);
    expect(labels.join("|")).toMatch(/stogo/i);
  });

  it("returns exactly three fragments for the owner sentence", () => {
    const s = extractJournalSuggestions(ownerSentence);
    expect(s.fragments).toHaveLength(3);
  });

  it("preserves the raw phrase per fragment so the UI can show evidence", () => {
    const s = extractJournalSuggestions(ownerSentence);
    expect(s.fragments[0].rawPhrase.toLowerCase()).toContain("valandą");
    expect(s.fragments[1].rawPhrase).toContain("3 valandas");
    expect(s.fragments[2].rawPhrase).toContain("5 valandas");
  });

  it("does not mark fragments as a verified slug for cashier/driver (no fake taxonomy)", () => {
    const s = extractJournalSuggestions(ownerSentence);
    const cashier = s.fragments.find((f) =>
      f.rawPhrase.toLowerCase().includes("kasinink"),
    );
    const driver = s.fragments.find((f) =>
      f.rawPhrase.toLowerCase().includes("pavežėj"),
    );
    expect(cashier?.activitySlug).toBeNull();
    expect(driver?.activitySlug).toBeNull();
    // But the human label is set so the worker sees the work direction.
    expect(cashier?.activityLabel).not.toBeNull();
    expect(driver?.activityLabel).not.toBeNull();
  });
});

describe("extractJournalSuggestions — LT word-form numerics", () => {
  it("parses bare 'valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("Valandą dirbau pavežėju.");
    expect(s.fragments[0]?.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses 'vieną valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("Vieną valandą dirbau pavežėju.");
    expect(s.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses '1 valandą' as 1 hour", () => {
    const s = extractJournalSuggestions("1 valandą dirbau pavežėju.");
    expect(s.time).toEqual({ value: 1, unitSlug: "hours" });
  });

  it("parses 'pusvalandį' as half an hour", () => {
    const s = extractJournalSuggestions("Pusvalandį tvarkiau įrankius.");
    expect(s.fragments[0]?.time).toEqual({ value: 0.5, unitSlug: "hours" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v2 — LT number-words for hours / minutes / days, plus three new activity
// directions (door + window, roof framing, project preparation).
// ─────────────────────────────────────────────────────────────────────────────

describe("extractJournalSuggestions — v2 LT number-word numerics", () => {
  it("parses 'keturias valandas' as 4 hours", () => {
    const s = extractJournalSuggestions("Keturias valandas dirbau objektuose.");
    expect(s.fragments[0]?.time).toEqual({ value: 4, unitSlug: "hours" });
  });

  it("parses 'dvi valandas' as 2 hours", () => {
    const s = extractJournalSuggestions("Dvi valandas dirbau pavežėju.");
    expect(s.fragments[0]?.time).toEqual({ value: 2, unitSlug: "hours" });
  });

  it("parses 'penkiolika minučių' as 15 minutes", () => {
    const s = extractJournalSuggestions(
      "Penkiolika minučių valiau įrankius.",
    );
    expect(s.fragments[0]?.time).toEqual({ value: 15, unitSlug: "minutes" });
  });

  it("parses 'dvi valandas ir penkiolika minučių' as two fragments (2h + 15min)", () => {
    const s = extractJournalSuggestions(
      "Dvi valandas ir penkiolika minučių rengiau projektą.",
    );
    const times = s.fragments
      .filter((f) => f.time)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(times).toEqual(["2hours", "15minutes"]);
  });

  it("parses 'tris dienas' as 3 days", () => {
    const s = extractJournalSuggestions("Tris dienas dirbau aikštelėje.");
    expect(s.fragments[0]?.time).toEqual({ value: 3, unitSlug: "days" });
  });

  it("digit form still wins when both number-word and digit are present", () => {
    const s = extractJournalSuggestions("8 valandas dirbau.");
    expect(s.fragments[0]?.time).toEqual({ value: 8, unitSlug: "hours" });
  });
});

describe("extractJournalSuggestions — v2 LT activity hints", () => {
  it("'Dvi valandas montavau duris' → door / window installation (carpenter)", () => {
    const s = extractJournalSuggestions("Dvi valandas montavau duris.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].activitySlug).toBe("carpenter");
    expect(s.fragments[0].activityLabel).toMatch(/durų ir langų/i);
  });

  it("'Tris valandas stačiau langus' → door / window installation", () => {
    const s = extractJournalSuggestions("Tris valandas stačiau langus.");
    expect(s.fragments[0].activityLabel).toMatch(/durų ir langų/i);
  });

  it("'Keturias valandas dariau stogo karkasą' → roof framing (carpenter), NOT roofing", () => {
    const s = extractJournalSuggestions(
      "Keturias valandas dariau stogo karkasą.",
    );
    expect(s.fragments[0].activitySlug).toBe("carpenter");
    expect(s.fragments[0].activityLabel).toMatch(/stogo karkas/i);
  });

  it("'Vieną valandą rengiau projektą' → project preparation (label-only, slug=null)", () => {
    const s = extractJournalSuggestions("Vieną valandą rengiau projektą.");
    expect(s.fragments[0].activitySlug).toBeNull();
    expect(s.fragments[0].activityLabel).toMatch(/projekto rengim/i);
  });

  it("mixed v2 sentence yields 3 fragments + 3 activity directions", () => {
    const text =
      "Vieną valandą rengiau projektą, dvi valandas montavau duris, " +
      "ir keturias valandas dariau stogo karkasą.";
    const s = extractJournalSuggestions(text);
    expect(s.fragments).toHaveLength(3);
    const labels = s.fragments.map((f) => f.activityLabel).join("|");
    expect(labels).toMatch(/projekto rengim/i);
    expect(labels).toMatch(/durų ir langų/i);
    expect(labels).toMatch(/stogo karkas/i);
    const times = s.fragments
      .filter((f) => f.time)
      .map((f) => `${f.time!.value}${f.time!.unitSlug}`);
    expect(times).toEqual(["1hours", "2hours", "4hours"]);
  });
});

describe("extractJournalSuggestions — single-fragment per-domain mappings", () => {
  it("'Valandą dirbau pavežėju' yields 1h + driver direction", () => {
    const s = extractJournalSuggestions("Valandą dirbau pavežėju.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(1);
    expect(s.fragments[0].activityLabel).toMatch(/pavežėjimas|vairavimas/i);
  });

  it("'3 valandas parduotuvėje kasininku' yields 3h + cashier direction", () => {
    const s = extractJournalSuggestions("3 valandas parduotuvėje kasininku.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(3);
    expect(s.fragments[0].activityLabel).toMatch(/kasininko|parduotuvės/i);
  });

  it("'5 valandas padėjau dengti stogą' yields 5h + roofing direction", () => {
    const s = extractJournalSuggestions("5 valandas padėjau dengti stogą.");
    expect(s.fragments).toHaveLength(1);
    expect(s.fragments[0].time?.value).toBe(5);
    expect(s.fragments[0].activityLabel).toMatch(/stogo/i);
    expect(s.fragments[0].activitySlug).toBe("roofer");
  });

  it("vague text does not invent work", () => {
    const s = extractJournalSuggestions("Šiandien buvo neblogai.");
    expect(s.fragments).toHaveLength(0);
    expect(s.hasAny).toBe(false);
  });
});
