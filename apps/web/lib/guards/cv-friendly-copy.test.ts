import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CV-friendly worker copy guard (fix/cv).
 *
 * Normal users see simple CV-building language, not technical evidence /
 * provenance wording. Pins:
 *   - the worker's professional-record nav + page read as "Mano CV", never
 *     "Mano darbo įrodymai" / "Darbo įrodymai" (or EN/RU equivalents);
 *   - the composer skill-suggestion heading is friendly ("Siūlomi įgūdžiai"),
 *     with one honest friendly note, not a "self-declared" provenance triad;
 *   - the stale-skill unlink action is the simple "Atsieti";
 *   - no raw technical source-taxonomy identifiers leak into ANY visible string.
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (loc: string) => JSON.parse(read(`messages/${loc}.json`)) as Record<string, any>;
const journalNs = (loc: string) => JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, string>;

const LOCS = ["lt", "en", "ru"] as const;

describe("Guard: worker professional record reads as 'CV', not 'evidence'", () => {
  const CV = /\bcv\b/i;
  const EVIDENCE = /įrodym|evidence|доказатель|свидетельств/i;

  it("nav tab (tabs.journal) is CV, not evidence", () => {
    for (const loc of LOCS) {
      const v = base(loc).auth.dashboard.tabs.journal as string;
      expect(v, `${loc}.tabs.journal`).toMatch(CV);
      expect(v, `${loc}.tabs.journal must not say evidence`).not.toMatch(EVIDENCE);
    }
  });

  it("page H1 (journal.navTitle) is CV, not evidence", () => {
    for (const loc of LOCS) {
      const v = journalNs(loc).navTitle;
      expect(v, `${loc} journal.navTitle`).toMatch(CV);
      expect(v, `${loc} journal.navTitle must not say evidence`).not.toMatch(EVIDENCE);
    }
  });

  it("profileHub journal link + pillar label are CV, not 'work evidence'", () => {
    for (const loc of LOCS) {
      const ph = base(loc).profileHub;
      expect(ph.journalLink, `${loc} profileHub.journalLink`).not.toMatch(EVIDENCE);
      expect(ph.pillars.journal.label, `${loc} profileHub.pillars.journal.label`).not.toMatch(EVIDENCE);
    }
  });
});

describe("Guard: composer skill suggestions use friendly, not technical, copy", () => {
  it("heading (structuring.groupEyebrow) is friendly, not 'self-declared suggestions'", () => {
    const lt = base("lt").structuring.groupEyebrow as string;
    const en = base("en").structuring.groupEyebrow as string;
    expect(lt).toMatch(/siūlomi įgūdžiai/i);
    expect(lt).not.toMatch(/paties nurodyt/i);
    expect(en).toMatch(/suggested skills/i);
    expect(en).not.toMatch(/self-declared/i);
  });

  it("the friendly bucket note exists and makes no AI / verification claim", () => {
    const FAKE = /\bAI\b|dirbtin\w*\s*intelekt|automati|\bmatch(ed|ing)\b/i;
    for (const loc of LOCS) {
      const note = journalNs(loc).skillProvenanceNote;
      expect(note, `${loc} skillProvenanceNote`).toBeTruthy();
      expect(note).not.toMatch(FAKE);
    }
    // LT/EN say "suggestion from your text".
    expect(journalNs("lt").skillProvenanceNote).toMatch(/pasiūlymas iš jūsų teksto/i);
    expect(journalNs("en").skillProvenanceNote).toMatch(/suggestion from your text/i);
  });

  it("the per-card technical provenance triad is NOT rendered in the composer", () => {
    const composer = read("components/app/journal-entry-composer.tsx");
    expect(composer).not.toMatch(/SuggestionProvenanceLabel/);
  });
});

describe("Guard: stale-skill unlink action is the simple 'Atsieti'", () => {
  it("journalSkillLinks.unlinkFlagged is simple, not 'the wrong ones / netinkamus'", () => {
    expect(base("lt").journalSkillLinks.unlinkFlagged).toBe("Atsieti");
    expect(base("en").journalSkillLinks.unlinkFlagged).toBe("Unlink");
    expect(base("lt").journalSkillLinks.unlinkFlagged).not.toMatch(/netinkam/i);
  });
});

describe("Guard: no raw technical source taxonomy leaks into visible copy", () => {
  // Only the worker-visible source enum values are forbidden. (These are code
  // identifiers; they may legitimately appear as JSON KEYS / status-map keys,
  // so we scan string VALUES only — what a user could actually see.)
  const TECH = /recognized_from_text|manually_linked_to_entry|confirmed_by_person|stale_needs_review|profile_skill_available_to_link/;
  function values(obj: unknown, out: string[] = []): string[] {
    if (typeof obj === "string") out.push(obj);
    else if (Array.isArray(obj)) obj.forEach((v) => values(v, out));
    else if (obj && typeof obj === "object") for (const v of Object.values(obj)) values(v, out);
    return out;
  }
  it("no source-enum identifier appears in any active-locale message VALUE", () => {
    for (const loc of LOCS) {
      for (const obj of [base(loc), journalNs(loc)]) {
        const offenders = values(obj).filter((v) => TECH.test(v));
        expect(offenders, `${loc} visible values with a raw identifier: ${offenders.join(", ")}`).toEqual([]);
      }
    }
  });
});
