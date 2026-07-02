import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CV-friendly worker copy guard (fix/cv).
 *
 * Normal users see simple CV-building language, not technical evidence /
 * provenance wording. Pins:
 *   - the work-journal page reads as the worker's work records ("Darbo
 *     įrašai", cv-workspace-ia: the /cv page is the ONLY surface titled
 *     "Mano CV"), and the primary tab is the human work-journal action
 *     ("Darbo žurnalas") — never "Mano darbo įrodymai" / "Darbo įrodymai"
 *     (or EN/RU evidence equivalents);
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

  it("nav tab (tabs.journal) is the human work-journal action, not evidence wording", () => {
    // Action-first IA v1: the primary tab is "Darbo žurnalas" (the work-record
    // ACTION). It must never read as technical "evidence/įrodymai".
    for (const loc of LOCS) {
      const v = base(loc).auth.dashboard.tabs.journal as string;
      expect(v, `${loc}.tabs.journal non-empty`).toBeTruthy();
      expect(v, `${loc}.tabs.journal must not say evidence`).not.toMatch(EVIDENCE);
    }
  });

  it("page H1 (journal.navTitle) is the work-records surface, not a second 'Mano CV'", () => {
    // cv-workspace-ia: the journal is the source that FEEDS the CV; only the
    // /cv page carries the "Mano CV" title. The journal H1 must not read as
    // CV or as technical evidence wording.
    for (const loc of LOCS) {
      const v = journalNs(loc).navTitle;
      expect(v, `${loc} journal.navTitle non-empty`).toBeTruthy();
      expect(v, `${loc} journal.navTitle must not be CV-titled`).not.toMatch(CV);
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

  it("the suggestion bucket carries NO explanatory note paragraph (quiet UI)", () => {
    // Owner: remove the disclaimer/explanation entirely — do not rephrase it.
    for (const loc of LOCS) {
      expect(journalNs(loc).skillProvenanceNote, `${loc} skillProvenanceNote must be gone`).toBeUndefined();
    }
  });

  it("the per-card technical provenance triad is NOT rendered in the composer", () => {
    const composer = read("components/app/journal-entry-composer.tsx");
    expect(composer).not.toMatch(/SuggestionProvenanceLabel/);
  });
});

describe("Guard: CV tier label is neutral records language (silent-trust rule)", () => {
  it("cvExport.tiers.confirmed reads as a record state, never a certification", () => {
    // Silent-trust rule: no public "patvirtinta/confirmed/verified" certification.
    expect(base("lt").cvExport.tiers.confirmed).toBe("Su įrašais");
    expect(base("en").cvExport.tiers.confirmed).toBe("With records");
    expect(base("lt").cvExport.tiers.confirmed).not.toMatch(/patvirtin|vadov/i);
    expect(base("en").cvExport.tiers.confirmed).not.toMatch(/verif|confirm/i);
    // the process-explanation hints are removed entirely
    expect(base("lt").cvExport.tierHints).toBeUndefined();
  });
});

describe("Guard: CV-export sheet uses CV language, not proof/verified", () => {
  it("pageTitle is CV (not 'Verified CV'); proofTitle is CV records; verifyNote removed", () => {
    expect(base("lt").cvExport.pageTitle).toBe("Mano CV");
    expect(base("en").cvExport.pageTitle).toBe("My CV");
    expect(base("en").cvExport.pageTitle).not.toMatch(/verif/i);
    expect(base("lt").cvExport.proofTitle).toBe("CV darbo įrašai");
    expect(base("en").cvExport.proofTitle).toBe("CV work records");
    expect(base("lt").cvExport.verifyNote).toBeUndefined();
    expect(base("en").cvExport.verifyNote).toBeUndefined();
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
