import { describe, expect, it } from "vitest";

import { matchWorkerToNeed, type MatchNeed, type MatchSubject } from "./match-v1";
import { sanitizeStructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

/**
 * Wagon 4 — author-selectable mandatory/preferred requirement tiers
 * (structured_v2.requirement_priorities).
 *
 * Pins:
 *   1. BACKWARD COMPATIBILITY: an absent (or empty) map produces results
 *      byte-identical to the pre-tier engine defaults;
 *   2. "preferred" demotes a default-hard requirement to weighted/negotiable
 *      (never blocks, never caps below possible on its own);
 *   3. "mandatory" promotes a default-preferred requirement to hard
 *      (blocking, eligible=false, status capped at weak BEFORE ordering);
 *   4. min_experience is evaluated ONLY when the author set a tier for it;
 *   5. secondary languages: the FIRST stated language always keeps its
 *      default tier; only later entries are demotable;
 *   6. tier provenance: author-decided criterion results carry
 *      authorMarked=true; default-tier results never do.
 */

const v2 = (input: Record<string, unknown>) => {
  const parsed = sanitizeStructuredDemandV2(input);
  if (parsed === null) throw new Error("fixture v2 cluster did not validate");
  return parsed;
};

/** A need whose skill set the subject fully covers, so tier effects are the
 *  only thing that moves the status. */
const need = (structured: Record<string, unknown> | null): MatchNeed => ({
  skillIds: ["cooking", "baking"],
  needSource: "human_structured",
  structuredV2: structured === null ? null : v2(structured),
});

const strongSubject: MatchSubject = {
  skills: [
    { uri: "cooking", evidence: "manager_confirmed" },
    { uri: "baking", evidence: "manager_confirmed" },
  ],
  availabilityStatus: "available",
  ownTools: false,
  ownVehicle: false,
  drivingLicenceCategories: ["B"],
  nightShiftsOk: false,
  weekendShiftsOk: true,
  experienceYears: 3,
  languageLevels: [{ lang: "en", level: "B2" }],
  accommodationNeeded: true,
};

describe("1. backward compatibility — absent/empty map keeps today's results", () => {
  const statedRequirements = {
    target_supply: "individual",
    time: { shifts: ["night", "weekend"] },
    transport: { own_vehicle_required: true, licence_categories: ["B", "C"] },
    requirements: {
      own_tools: true,
      min_experience_years: 5,
      languages: [
        { lang: "en", level: "B1" },
        { lang: "de", level: "B1" },
      ],
    },
  };

  it("requirement_priorities: {} ≡ no map at all (deep-equal results)", () => {
    const without = matchWorkerToNeed(need(statedRequirements), strongSubject);
    const withEmpty = matchWorkerToNeed(
      need({ ...statedRequirements, requirement_priorities: {} }),
      strongSubject,
    );
    expect(withEmpty).toEqual(without);
  });

  it("default tiers still behave exactly as before the map existed", () => {
    const r = matchWorkerToNeed(need(statedRequirements), strongSubject);
    // own_tools=false, own_vehicle_required unmet, licence C missing,
    // night shift declined, de language missing → all default-hard blocks.
    const blockingIds = r.blocking.map((b) => b.criterion);
    expect(blockingIds).toContain("own_tools");
    expect(blockingIds).toContain("own_vehicle");
    expect(blockingIds).toContain("licence_categories");
    expect(blockingIds).toContain("night_shifts");
    expect(blockingIds).toContain("language");
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    // min_experience stays UNEVALUATED without an author tier.
    expect(
      [...r.blocking, ...r.strengths, ...r.negotiables, ...r.matchedHard].some(
        (c) => c.criterion === "min_experience",
      ),
    ).toBe(false);
    expect(r.missingFacts.some((m) => m.criterion === "min_experience")).toBe(false);
    // No author provenance anywhere — every tier here is an engine default.
    expect(
      [...r.blocking, ...r.strengths, ...r.negotiables, ...r.matchedHard].some(
        (c) => c.authorMarked === true,
      ),
    ).toBe(false);
  });
});

describe("2. preferred demotes default-hard requirements", () => {
  it("own_tools preferred: stated worker 'no' becomes a discussion point", () => {
    const r = matchWorkerToNeed(
      need({
        requirements: { own_tools: true },
        requirement_priorities: { own_tools: "preferred" },
      }),
      strongSubject,
    );
    expect(r.blocking).toEqual([]);
    expect(r.eligible).toBe(true);
    expect(
      r.negotiables.some((n) => n.criterion === "own_tools" && n.authorMarked === true),
    ).toBe(true);
    expect(r.status).toBe("strong");
  });

  it("own_vehicle_required preferred: unmet becomes negotiable; held becomes a strength", () => {
    const base = {
      transport: { own_vehicle_required: true },
      requirement_priorities: { own_vehicle: "preferred" },
    };
    const unmet = matchWorkerToNeed(need(base), strongSubject);
    expect(unmet.blocking).toEqual([]);
    expect(
      unmet.negotiables.some((n) => n.criterion === "own_vehicle" && n.authorMarked),
    ).toBe(true);

    const held = matchWorkerToNeed(need(base), { ...strongSubject, ownVehicle: true });
    expect(
      held.strengths.some((s) => s.criterion === "own_vehicle" && s.authorMarked),
    ).toBe(true);
    expect(held.matchedHard.some((h) => h.criterion === "own_vehicle")).toBe(false);
  });

  it("licence_categories preferred: missing category no longer blocks", () => {
    const r = matchWorkerToNeed(
      need({
        transport: { licence_categories: ["B", "C"] },
        requirement_priorities: { licence_categories: "preferred" },
      }),
      strongSubject, // holds only B
    );
    expect(r.blocking).toEqual([]);
    expect(
      r.negotiables.some((n) => n.criterion === "licence_categories" && n.authorMarked),
    ).toBe(true);
    expect(r.status).toBe("strong");
  });

  it("night_shifts preferred: declined night shift is negotiable; weekend stays default-hard-met", () => {
    const r = matchWorkerToNeed(
      need({
        time: { shifts: ["night", "weekend"] },
        requirement_priorities: { night_shifts: "preferred" },
      }),
      strongSubject, // nightShiftsOk=false, weekendShiftsOk=true
    );
    expect(r.blocking).toEqual([]);
    expect(
      r.negotiables.some((n) => n.criterion === "night_shifts" && n.authorMarked),
    ).toBe(true);
    // Weekend keeps the default hard tier (met) — no author provenance.
    const weekend = r.matchedHard.find((h) => h.criterion === "weekend_shifts");
    expect(weekend).toBeTruthy();
    expect(weekend?.authorMarked).toBeUndefined();
  });
});

describe("3. mandatory promotes default-preferred requirements to hard", () => {
  it("requirements.own_vehicle (default merely-preferred) marked mandatory blocks", () => {
    const r = matchWorkerToNeed(
      need({
        requirements: { own_vehicle: true },
        requirement_priorities: { own_vehicle: "mandatory" },
      }),
      strongSubject, // ownVehicle=false
    );
    const block = r.blocking.find((b) => b.criterion === "own_vehicle");
    expect(block).toBeTruthy();
    expect(block?.authorMarked).toBe(true);
    expect(r.eligible).toBe(false);
    // Structural invariant: the hard failure caps the status at weak BEFORE
    // any ordering — full skill coverage cannot outscore it.
    expect(r.status).toBe("weak");
  });

  it("accommodation marked mandatory: needs-vs-not-offered becomes a hard block (v2 state)", () => {
    const r = matchWorkerToNeed(
      need({
        accommodation: { state: "not_offered" },
        requirement_priorities: { accommodation: "mandatory" },
      }),
      strongSubject, // accommodationNeeded=true
    );
    const block = r.blocking.find((b) => b.criterion === "accommodation");
    expect(block).toBeTruthy();
    expect(block?.authorMarked).toBe(true);
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(r.gaps.some((g) => g.code === "accommodation_needed_not_provided")).toBe(true);
  });

  it("accommodation mandatory is met when the worker does not need it", () => {
    const r = matchWorkerToNeed(
      need({
        accommodation: { state: "not_offered" },
        requirement_priorities: { accommodation: "mandatory" },
      }),
      { ...strongSubject, accommodationNeeded: false },
    );
    expect(r.blocking).toEqual([]);
    expect(
      r.matchedHard.some((h) => h.criterion === "accommodation" && h.authorMarked),
    ).toBe(true);
  });

  it("accommodation preferred keeps the soft-cap semantics (negotiable, still eligible)", () => {
    const r = matchWorkerToNeed(
      need({
        accommodation: { state: "not_offered" },
        requirement_priorities: { accommodation: "preferred" },
      }),
      strongSubject,
    );
    expect(r.blocking).toEqual([]);
    expect(r.eligible).toBe(true);
    expect(
      r.negotiables.some((n) => n.criterion === "accommodation" && n.authorMarked),
    ).toBe(true);
    expect(r.status).toBe("possible"); // soft cap, exactly like the default path
  });
});

describe("4. min_experience — evaluated only when the author set a tier", () => {
  const withMinExp = (tier: "mandatory" | "preferred") => ({
    requirements: { min_experience_years: 5 },
    requirement_priorities: { min_experience: tier },
  });

  it("mandatory + below the bar → hard block with author provenance", () => {
    const r = matchWorkerToNeed(need(withMinExp("mandatory")), strongSubject); // 3y < 5y
    const block = r.blocking.find((b) => b.criterion === "min_experience");
    expect(block).toBeTruthy();
    expect(block?.authorMarked).toBe(true);
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
  });

  it("preferred + below the bar → negotiable, never a block", () => {
    const r = matchWorkerToNeed(need(withMinExp("preferred")), strongSubject);
    expect(r.blocking).toEqual([]);
    expect(
      r.negotiables.some((n) => n.criterion === "min_experience" && n.authorMarked),
    ).toBe(true);
    expect(r.status).toBe("strong");
  });

  it("met bar → hard-met (mandatory) / strength (preferred)", () => {
    const senior: MatchSubject = { ...strongSubject, experienceYears: 8 };
    const m = matchWorkerToNeed(need(withMinExp("mandatory")), senior);
    expect(
      m.matchedHard.some((h) => h.criterion === "min_experience" && h.authorMarked),
    ).toBe(true);
    const p = matchWorkerToNeed(need(withMinExp("preferred")), senior);
    expect(
      p.strengths.some((s) => s.criterion === "min_experience" && s.authorMarked),
    ).toBe(true);
  });

  it("unstated worker experience → honest worker-side missing fact, no outcome", () => {
    const r = matchWorkerToNeed(need(withMinExp("mandatory")), {
      ...strongSubject,
      experienceYears: null,
    });
    expect(
      r.missingFacts.some(
        (m) => m.criterion === "min_experience" && m.side === "worker",
      ),
    ).toBe(true);
    expect(r.blocking.some((b) => b.criterion === "min_experience")).toBe(false);
    expect(r.eligible).toBe(true);
  });
});

describe("5. secondary languages — first stays default, later entries demotable", () => {
  const twoLangs = (tier?: "mandatory" | "preferred") => ({
    requirements: {
      languages: [
        { lang: "en", level: "B1" },
        { lang: "de", level: "B1" },
      ],
    },
    ...(tier ? { requirement_priorities: { secondary_languages: tier } } : {}),
  });

  it("preferred: missing SECOND language becomes negotiable with provenance", () => {
    const r = matchWorkerToNeed(need(twoLangs("preferred")), strongSubject); // has en B2 only
    expect(r.blocking.some((b) => b.criterion === "language")).toBe(false);
    expect(
      r.negotiables.some((n) => n.criterion === "language" && n.authorMarked === true),
    ).toBe(true);
    expect(r.eligible).toBe(true);
  });

  it("preferred: missing FIRST language still blocks (default tier kept)", () => {
    const r = matchWorkerToNeed(need(twoLangs("preferred")), {
      ...strongSubject,
      languageLevels: [{ lang: "de", level: "C1" }], // holds only the SECOND
    });
    expect(r.blocking.some((b) => b.criterion === "language")).toBe(true);
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
  });

  it("mandatory (or absent) keeps every stated language hard", () => {
    for (const fixture of [twoLangs("mandatory"), twoLangs()]) {
      const r = matchWorkerToNeed(need(fixture), strongSubject);
      expect(r.blocking.some((b) => b.criterion === "language")).toBe(true);
      expect(r.eligible).toBe(false);
    }
  });
});

describe("6. a tier alone never invents a requirement", () => {
  it("priorities without the corresponding stated requirement change nothing", () => {
    const bare = matchWorkerToNeed(
      need({ time: { hours_per_week: 40 } }),
      strongSubject,
    );
    const tiered = matchWorkerToNeed(
      need({
        time: { hours_per_week: 40 },
        requirement_priorities: {
          own_vehicle: "mandatory",
          own_tools: "mandatory",
          licence_categories: "mandatory",
          night_shifts: "mandatory",
          weekend_shifts: "mandatory",
          secondary_languages: "mandatory",
        },
      }),
      strongSubject,
    );
    expect(tiered).toEqual(bare);
  });
});
