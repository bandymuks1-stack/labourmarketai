import { describe, expect, it } from "vitest";
import { structureValueStatement } from "./value-statement";
import { maskServiceNoun, structureNeed } from "./structure-need";

/**
 * Real-user fitness walk on production, 2026-09-06 (bounded E2E identities,
 * read-only). Sentences ordinary people typed and what the product did:
 *
 *   "noriu siūlyti buhalterijos paslaugas" → "Jūsų teigimu: Slaugos
 *   pagalbininkas" — the care-assistant needle "slaug" matched INSIDE the
 *   folded service noun "paslaugas". A claim the person never made.
 *
 *   "galiu kirpti plaukus namuose" → the not-understood menu, although the
 *   services door (/dashboard/services) exists for exactly this.
 *
 * These pins keep both honest.
 */
describe("the service noun is never an occupation", () => {
  it("maskServiceNoun removes every 'paslaug…' token and nothing else", () => {
    expect(maskServiceNoun("buhalterijos paslaugos vilniuje")).toBe("buhalterijos   vilniuje");
    expect(maskServiceNoun("reikia 2 slaugytoju")).toBe("reikia 2 slaugytoju");
  });

  it("'noriu siūlyti buhalterijos paslaugas' is an offered SERVICE with no occupation claim", () => {
    const v = structureValueStatement("Noriu siūlyti buhalterijos paslaugas");
    expect(v.axis).toBe("offer");
    expect(v.subject).toBe("service");
    expect(v.workType).toBeNull();
    expect(v.reasons.some((r) => r.startsWith("work_type:"))).toBe(false);
  });

  it("the employer structurer does not read 'paslaugos' as a care assistant either", () => {
    const s = structureNeed({ role: "buhalterijos paslaugos", description: null, notes: null, location: null });
    expect(s.workType).toBeNull();
    expect(s.teamSize).toBeNull();
  });

  it("a genuine care need still resolves — the mask is narrow", () => {
    const s = structureNeed({ role: "reikia 2 slaugytojų", description: null, notes: null, location: null });
    expect(s.workType).toBe("care_assistant");
    expect(s.teamSize).toBe(2);
  });
});

describe("an offer verb bound to an everyday activity is an offered service", () => {
  it.each([
    "galiu kirpti plaukus namuose",
    "Galiu mokyti matematikos",
    "siūlau valyti butus Vilniuje",
    "noriu siūlyti buhalterijos paslaugas",
  ])("%s → axis offer, subject service", (sentence) => {
    const v = structureValueStatement(sentence);
    expect(v.axis).toBe("offer");
    expect(v.subject).toBe("service");
  });

  it("'galiu kirpti plaukus' echoes the activity the person named", () => {
    const v = structureValueStatement("galiu kirpti plaukus namuose");
    expect(v.subjectLabel).toBeTruthy();
    expect(v.subjectLabel?.toLowerCase()).toContain("kirpti");
  });

  it("a bare activity stem without the offer verb stays employer demand", () => {
    const v = structureValueStatement("reikia 2 valytojų Kaune");
    expect(v.subject).not.toBe("service");
    expect(v.workType).toBe("cleaner");
  });

  it("'galiu mokytis' (to learn) is not an offered service", () => {
    const v = structureValueStatement("galiu mokytis vakarais");
    expect(v.subject).not.toBe("service");
  });
});
