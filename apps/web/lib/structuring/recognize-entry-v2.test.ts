import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recognizeEntryDepth } from "./recognize-entry";

/**
 * v2 journal recognition depth — deterministic, computed-only. Asserts the
 * HONEST behaviour: multi-work entries surface multiple work items, explicit
 * hours are read where present, multiple time fragments mark hours as
 * uncertain (no fabricated per-task split), and unknown text suggests nothing.
 * Real Lithuanian phrases from smoke.
 */

describe("recognizeEntryDepth — single phrase → one work item", () => {
  it("scaffolding, no explicit hours, clear", () => {
    const r = recognizeEntryDepth("Dirbau su pastoliu");
    expect(r.works.map((w) => w.slug)).toEqual(["scaffolding"]);
    expect(r.hours).toBeNull();
    expect(r.certainty).toBe("clear");
    expect(r.needsClarification).toBe(false);
  });
});

describe("recognizeEntryDepth — multi-work entries → multiple items", () => {
  it("painting + wallpapering + site prep from one entry", () => {
    const r = recognizeEntryDepth("10h 3h dažiau sienas 4h tapetavau 3h darbo pasiruošimas");
    const slugs = r.works.map((w) => w.slug);
    expect(slugs).toContain("painting");
    expect(slugs).toContain("wallpapering");
    expect(slugs.length).toBeGreaterThanOrEqual(2);
  });

  it("timber framing + blueprint reading from one entry", () => {
    const r = recognizeEntryDepth(
      "Stačiau medinį karkasą: sijos, gegnės ir apkalimas pagal projektą, 7 val.",
    );
    const slugs = r.works.map((w) => w.slug);
    expect(slugs).toContain("timber-framing");
    expect(slugs).toContain("blueprint-reading");
  });

  it("formwork + concrete prep + blueprint reading from two sentences", () => {
    const r = recognizeEntryDepth(
      "Klojau perdangos klojinius objekte, 6 val. Surinkau sąramas pagal brėžinius.",
    );
    const slugs = r.works.map((w) => w.slug);
    expect(slugs).toContain("formwork");
    expect(slugs).toContain("blueprint-reading");
  });
});

describe("recognizeEntryDepth — explicit hours where present", () => {
  it("single clear total → hours read and marked certain", () => {
    const r = recognizeEntryDepth(
      "Stačiau medinį karkasą: sijos, gegnės ir apkalimas pagal projektą, 7 val.",
    );
    expect(r.hours).not.toBeNull();
    expect(r.hours?.value).toBe(7);
    expect(r.hours?.unit).toBe("hours");
    expect(r.hours?.certain).toBe(true);
    expect(r.certainty).toBe("clear");
  });
});

describe("recognizeEntryDepth — inconsistent/unclear hours → uncertainty, not fake total", () => {
  it("many time fragments → hours flagged uncertain + partial certainty", () => {
    const r = recognizeEntryDepth(
      "Kasiau smėlį 9h 4h į vieną pusę 4h į kitą pusę 1h galvojau kaip nešti",
    );
    expect(r.works.map((w) => w.slug)).toContain("earthworks");
    expect(r.timeMentions).toBeGreaterThan(1);
    expect(r.hours?.certain).toBe(false);
    expect(r.certainty).toBe("partial");
    expect(r.needsClarification).toBe(true);
  });

  it("multi-task multi-time entry does not invent a clean per-task split", () => {
    const r = recognizeEntryDepth("10h 3h dažiau sienas 4h tapetavau 3h darbo pasiruošimas");
    // One total is shown, but flagged uncertain — never N separate fake totals.
    expect(r.timeMentions).toBeGreaterThan(1);
    expect(r.hours?.certain).toBe(false);
    expect(r.certainty).toBe("partial");
  });
});

describe("recognizeEntryDepth — unknown text → no fabrication", () => {
  it("no construction work → unclear, no works, no hours", () => {
    const r = recognizeEntryDepth("buvau darbe ir grįžau namo");
    expect(r.works).toHaveLength(0);
    expect(r.hours).toBeNull();
    expect(r.certainty).toBe("unclear");
  });
  it("empty text → unclear, nothing recognized", () => {
    const r = recognizeEntryDepth("");
    expect(r.works).toHaveLength(0);
    expect(r.certainty).toBe("unclear");
  });
});

describe("recognizeEntryDepth — evidence phrases are surfaced", () => {
  it("each recognized work carries a snippet from the worker's text", () => {
    const r = recognizeEntryDepth("Dažiau sienas 3 val., objektas X");
    const painting = r.works.find((w) => w.slug === "painting");
    expect(painting?.evidence).toBeTruthy();
    expect(painting?.evidence?.toLowerCase()).toContain("daž");
  });
});

describe("review inbox depth UI — human labels, no raw keys, hours + evidence", () => {
  const src = readFileSync(
    join(__dirname, "..", "..", "components", "app", "journal-inbox-entry.tsx"),
    "utf8",
  );
  it("renders recognized-works header, evidence, hours and certainty labels", () => {
    expect(src).toMatch(/t\("inbox\.recognizedWorks"\)/);
    expect(src).toMatch(/t\("inbox\.evidenceLabel"\)/);
    expect(src).toMatch(/t\("inbox\.hoursClear"\)/);
    expect(src).toMatch(/t\("inbox\.hoursUnclear"\)/);
    expect(src).toMatch(/t\("inbox\.needsClarification"\)/);
  });
  it("keeps the entry text visible (no fake AI / verified-automatically language)", () => {
    expect(src).not.toMatch(/verified automatically|auto[- ]?verified|verified by AI/i);
  });
  for (const locale of ["en", "lt"] as const) {
    it(`${locale} inbox has the v2 depth keys`, () => {
      const j = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "messages", locale, "journal.json"), "utf8"),
      ) as { inbox: Record<string, string> };
      for (const k of [
        "recognizedWorks",
        "evidenceLabel",
        "hoursLabel",
        "hoursClear",
        "hoursUnclear",
        "clear",
        "unclear",
        "needsClarification",
        "clarifyHint",
      ]) {
        expect(j.inbox[k], `${locale} inbox.${k}`).toBeTruthy();
      }
    });
  }
});

describe("v3 reviewer correction loop — suggested clarification message", () => {
  const src = readFileSync(
    join(__dirname, "..", "..", "components", "app", "journal-inbox-entry.tsx"),
    "utf8",
  );
  it("builds a suggestion, offers copy, and prefills the request-changes note", () => {
    expect(src).toMatch(/clarificationSuggestion/);
    expect(src).toMatch(/t\("inbox\.copySuggestion"\)/);
    expect(src).toMatch(/t\("inbox\.clarifySuggestionPrefix"\)/);
    // The note field is prefilled with the suggestion when clarification is needed.
    expect(src).toMatch(/defaultValue=\{[\s\S]*clarificationSuggestion/);
    // Uses the EXISTING request-changes flow (decision=changes_requested), no new storage.
    expect(src).toMatch(/name="decision" value=\{mode\}/);
  });
  for (const locale of ["en", "lt"] as const) {
    it(`${locale} inbox has the v3 correction keys`, () => {
      const j = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "messages", locale, "journal.json"), "utf8"),
      ) as { inbox: Record<string, string> };
      for (const k of [
        "clarifyHoursIntro",
        "clarifySuggestionPrefix",
        "clarifyGeneric",
        "copySuggestion",
        "copied",
      ]) {
        expect(j.inbox[k], `${locale} inbox.${k}`).toBeTruthy();
      }
    });
  }
});
