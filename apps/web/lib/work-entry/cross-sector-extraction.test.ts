import { describe, it, expect } from "vitest";
import { buildEntrySkillReview } from "./entry-skill-review";

/**
 * Cross-sector extraction model — the owner-required distinctions:
 *  - existing profile skills vs new candidate skills (deduped, no double-add);
 *  - performed activities (sector-tagged) and quantity/duration signals;
 *  - evidence source = work_journal; verification state = unverified.
 */

describe("existing vs new skills (dedup an already-declared skill)", () => {
  it("a recognised skill already on the profile is EXISTING, never a NEW candidate", () => {
    const r = buildEntrySkillReview("Gaminau maistą virtuvėje", [
      { label: "Maisto gaminimas" },
    ]);
    expect(r.existingItems.map((i) => i.label)).toContain("Maisto gaminimas");
    expect(r.newItems.map((i) => i.label)).not.toContain("Maisto gaminimas");
    // not duplicated across buckets
    expect(r.items.length).toBe(r.existingItems.length + r.newItems.length);
  });

  it("an undeclared activity is a NEW candidate signal", () => {
    const r = buildEntrySkillReview("Gaminau maistą virtuvėje", []);
    expect(r.newItems.map((i) => i.label)).toContain("Maisto gaminimas");
    expect(r.existingItems).toEqual([]);
  });

  it("existing match also works by canonical slug", () => {
    // Universal promotion (2026-07-04): generic premises cleaning resolves to
    // the universal cleaning-services slug, no longer the construction
    // site-cleaning slug.
    const r = buildEntrySkillReview("Valiau patalpas 6 val", [
      { slug: "cleaning-services", label: "irrelevant label" },
    ]);
    expect(r.existingItems.some((i) => i.canonicalSlug === "cleaning-services")).toBe(true);
  });
});

describe("performed activities + signals", () => {
  it("tags activities with their sector and keeps durations/quantities", () => {
    const r = buildEntrySkillReview("Vairavau sunkvežimį 3 valandas, vežiau 2 t krovinį maršrutu", []);
    expect(r.activities.some((a) => a.sector === "transport_logistics")).toBe(true);
    expect(r.durations.map((d) => d.value)).toContain(3);
    expect(r.quantities.length).toBeGreaterThan(0);
  });
});

describe("evidence source + verification state are honest", () => {
  it("evidence is work_journal and nothing is auto-verified", () => {
    const r = buildEntrySkillReview("Aptarnavau klientus prie kasos", []);
    expect(r.evidenceSource).toBe("work_journal");
    expect(r.verificationState).toBe("unverified");
    expect(r.items.every((i) => i.confirmed === false && i.status === "suggested")).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/"confirmed":true|"verified":true/);
  });
});