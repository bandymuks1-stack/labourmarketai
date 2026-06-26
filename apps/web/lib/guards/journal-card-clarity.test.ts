import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: journal entry card + edit flow are immediately understandable
 * (work-journal-perfect-flow-p0, owner core-clarity correction).
 *
 * The card must read top-to-bottom as: entry TEXT first → "Sistema suprato"
 * (current signals) → linked skills → "Ankstesni ryšiai" (collapsed) → status
 * + actions (quiet). The edit flow must not keep showing stale details as
 * current. These are static source-order checks so a regression that reorders
 * or buries the text fails here.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const page = read("app/[locale]/dashboard/journal/page.tsx");
const row = read("components/app/journal-entry-row.tsx");
const links = read("components/app/journal-entry-skill-links.tsx");
const composer = read("components/app/journal-entry-composer.tsx");

const CERT_STEM = /verif|confirm|tvirtin|patvirtin|подтверж|верифиц|\bbadge\b|\bproof\b/i;

describe("Guard: entry card is text-first then understood signals", () => {
  it("text label + text render before the understood section", () => {
    const iTextLabel = page.indexOf('t("entry.textLabel")');
    const iText = page.indexOf("{e.original_text}");
    const iUnderstood = page.indexOf('t("entry.understoodLabel")');
    expect(iTextLabel).toBeGreaterThan(-1);
    expect(iText).toBeGreaterThan(-1);
    expect(iUnderstood).toBeGreaterThan(-1);
    // text first, understood second.
    expect(iTextLabel).toBeLessThan(iText);
    expect(iText).toBeLessThan(iUnderstood);
  });

  it("entry text keeps clean wrapping and is not buried", () => {
    expect(page).toMatch(
      /whitespace-pre-wrap break-words[^"]*"\s*>\s*\n?\s*\{e\.original_text\}/,
    );
  });

  it("the status timeline is passed to the card's status slot (bottom zone)", () => {
    expect(page).toMatch(/statusSlot=\{/);
    expect(page).toMatch(/createdAt=\{e\.created_at\}/);
    expect(page).toMatch(/events=\{timeline\}/);
  });

  it("the understood section is gated on real signals (no empty padding)", () => {
    expect(page).toMatch(/hasUnderstood\s*&&/);
  });
});

describe("Guard: card renders sections in the right order", () => {
  it("children → linked skills → status → actions", () => {
    const iChildren = row.indexOf("{children}");
    const iSkills = row.indexOf("<JournalEntrySkillLinks");
    const iStatus = row.indexOf("{statusSlot}");
    const iActions = row.indexOf("journal-entry-edit-");
    expect(iChildren).toBeGreaterThan(-1);
    expect(iChildren).toBeLessThan(iSkills);
    expect(iSkills).toBeLessThan(iStatus);
    expect(iStatus).toBeLessThan(iActions);
  });
});

describe("Guard: linked signals vs earlier links are separate + collapsed", () => {
  it("earlier-links review bucket is collapsed by default", () => {
    expect(links).toMatch(/useState\(false\)/); // reviewOpen starts closed
    expect(links).toMatch(/reviewOpen\s*&&/); // chips render only when opened
  });
  it("clean chips and review chips are split by source, not mixed", () => {
    expect(links).toMatch(/cleanChips\s*=/);
    expect(links).toMatch(/reviewChips\s*=/);
  });
  it("the manual link-skill fallback stays available", () => {
    expect(links).toMatch(/t\("linkMore"\)/);
  });
});

describe("Guard: edit flow does not show stale details as current", () => {
  it("textDirty mutes the carried-over details + prompts re-run", () => {
    expect(composer).toMatch(/const textDirty =/);
    expect(composer).toMatch(/textDirty && "opacity-50"/);
    expect(composer).toMatch(/t\("editTextChangedHint"\)/);
  });
  it("a clear re-run action re-evaluates the CURRENT text", () => {
    expect(composer).toMatch(/data-testid="journal-edit-rerun"/);
    // The re-run button's onClick re-evaluates the current textarea value
    // (analyse(text)) immediately before the test id on the same element.
    expect(composer).toMatch(/analyse\(text\)[\s\S]{0,200}data-testid="journal-edit-rerun"/);
  });
});

describe("Guard: new card copy is neutral (no certification wording)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: textLabel / understoodLabel / signalsHeading present + neutral`, () => {
      const j = JSON.parse(read(`messages/${loc}/journal.json`)) as {
        entry: Record<string, string>;
      };
      const base = JSON.parse(read(`messages/${loc}.json`)) as {
        journalSkillLinks: Record<string, string>;
      };
      const values = [
        j.entry.textLabel,
        j.entry.understoodLabel,
        base.journalSkillLinks.signalsHeading,
        base.journalSkillLinks.reviewHeading,
      ];
      for (const v of values) {
        expect(v, `${loc}: missing label`).toBeTruthy();
        expect(CERT_STEM.test(v), `${loc}: "${v}" must be neutral`).toBe(false);
      }
    });
  }
});
