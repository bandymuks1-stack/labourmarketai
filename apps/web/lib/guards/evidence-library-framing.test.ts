import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Evidence Library framing guard (slice evidence-library-v1, PR D).
 *
 * The worker-facing CV/documents surface must read as a calm EVIDENCE library
 * that strengthens the work card — not an administrative file cabinet. Pins:
 *   - the CV surface is framed by evidence + benefit + work-card connection,
 *   - each evidence type is explained by benefit,
 *   - privacy is explicit (documents private; not shown without a clear basis),
 *   - no admin/file-cabinet wording, no fake verification / employer visibility.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const cv = (j: Record<string, unknown>) =>
  (j.structuring as { cv: Record<string, string> }).cv;

const KEYS = [
  "title",
  "helper",
  "evidenceTitle",
  "evidenceCv",
  "evidenceCerts",
  "evidencePhotos",
  "evidenceRecs",
  "evidenceLegal",
  "privacyNote",
] as const;

describe("CV surface is framed as an evidence library that strengthens the card", () => {
  it("LT title/helper lead with CV-as-evidence + work-card benefit + privacy", () => {
    expect(cv(lt).title).toMatch(/įrodym/i);
    expect(cv(lt).helper).toMatch(/darbo kortel/i);
    expect(cv(lt).helper).toMatch(/privat/i);
    expect(cv(lt).evidenceTitle).toMatch(/darbo kortel/i);
  });
  it("EN title/helper mirror the evidence + work-card + privacy framing", () => {
    expect(cv(en).title).toMatch(/evidence/i);
    expect(cv(en).helper).toMatch(/work card/i);
    expect(cv(en).helper).toMatch(/private/i);
    expect(cv(en).evidenceTitle).toMatch(/work card/i);
  });
  it("both locales expose every evidence-library key", () => {
    for (const k of KEYS) {
      expect(typeof cv(lt)[k] === "string" && cv(lt)[k].trim().length > 0, `lt structuring.cv.${k}`).toBe(true);
      expect(typeof cv(en)[k] === "string" && cv(en)[k].trim().length > 0, `en structuring.cv.${k}`).toBe(true);
    }
  });
});

describe("each evidence type is explained by benefit", () => {
  it("LT names experience / trust / real work / reliability / legal-only", () => {
    const c = cv(lt);
    expect(c.evidenceCv).toMatch(/patirt/i);
    expect(c.evidenceCerts).toMatch(/pasitikėjim/i);
    expect(c.evidencePhotos).toMatch(/realiai/i);
    expect(c.evidenceRecs).toMatch(/patikimum/i);
    expect(c.evidenceLegal).toMatch(/tik tada|įdarbinim|teisin/i);
  });
  it("EN names experience / trust / real work / reliability / legal-only", () => {
    const c = cv(en);
    expect(c.evidenceCv).toMatch(/experience/i);
    expect(c.evidenceCerts).toMatch(/trust/i);
    expect(c.evidencePhotos).toMatch(/actually did|real work/i);
    expect(c.evidenceRecs).toMatch(/reliab/i);
    expect(c.evidenceLegal).toMatch(/only when|hiring|legal/i);
  });
});

describe("privacy is explicit and honest (no fake employer visibility / verification)", () => {
  it("LT privacy note: private + not shown without a clear basis", () => {
    expect(cv(lt).privacyNote).toMatch(/privat/i);
    expect(cv(lt).privacyNote).toMatch(/be aiškaus pagrindo|nerodom/i);
  });
  it("EN privacy note: private + not shown without a clear basis", () => {
    expect(cv(en).privacyNote).toMatch(/private/i);
    expect(cv(en).privacyNote).toMatch(/without a clear basis|not shown/i);
  });
  it("no admin/file-cabinet wording, no fake verification/score/employer-can-see claim", () => {
    const blob = [cv(lt), cv(en)].map((c) => JSON.stringify(c)).join(" ");
    expect(blob).not.toMatch(/dokumentų modulis|failų valdymas|document module|file management/i);
    expect(blob).not.toMatch(/\bscore\b|\d+\s?%|verified by us|automatic verif|automatiškai patvirtin/i);
    // No positive claim that an employer/client already sees the documents.
    expect(blob).not.toMatch(/darbdavys mato|klientas mato|employer can see|client can see|visible to employers?/i);
  });
});

describe("the CV panel renders the evidence + privacy framing, one primary action", () => {
  const comp = read("components/app/cv-input-panel.tsx");
  it("mounts the evidence-types list + privacy note", () => {
    expect(comp).toMatch(/data-testid="cv-evidence-types"/);
    expect(comp).toMatch(/data-testid="cv-privacy-note"/);
    expect(comp).toMatch(/evidenceTitle/);
    expect(comp).toMatch(/privacyNote/);
  });
  it("keeps a single primary action (one submit Button, no extra gradient CTA)", () => {
    expect((comp.match(/<Button\b/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(comp).not.toMatch(/from-brand-blue to-brand-cyan/);
  });
});
