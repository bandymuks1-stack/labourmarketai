import { describe, expect, it } from "vitest";

import {
  MATCH_CALC_VERSION,
  compareLanguagesV2,
  comparePayBasisV2,
  languageLevelSatisfies,
  matchWorkerToNeed,
  type MatchNeed,
  type MatchSubject,
} from "@/lib/market/match-v1";
import {
  sanitizeStructuredDemandV2,
  type StructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";

/**
 * MATCHING DIMENSIONS v2.1 guard (Phase-2 PR 4) — the eight mirrored
 * dimensions on the ONE deterministic engine: languages (CEFR levels),
 * driving-licence categories, own vehicle, own tools, gross/net pay basis,
 * night shifts, weekend shifts, overtime.
 *
 * Contract rules pinned here:
 *   1. absence on either side = a missingFacts entry (side = who must
 *      provide, source = the real table/field) — NEVER a block, NEVER a
 *      fabricated outcome;
 *   2. both-sides-stated conflicts produce EXACTLY the specified class:
 *      language-above-level / licence-not-held / vehicle-required-not-owned /
 *      tools-required-not-owned / night / weekend → HARD;
 *      pay-basis mismatch / overtime → NEGOTIABLE;
 *   3. a hard failure forces eligible=false and caps status at weak no
 *      matter how strong the weighted (skill) evidence is;
 *   4. CEFR ordering A1<A2<B1<B2<C1<C2, native ≥ C2;
 *   5. one_per_team_sufficient demotes a failed language to negotiable ONLY
 *      for team-target demands (target_supply team | multiple_workers);
 *   6. determinism — same inputs twice → deep-equal output;
 *   7. calcVersion is "2.1".
 */

const v2 = (input: Record<string, unknown>): StructuredDemandV2 => {
  const parsed = sanitizeStructuredDemandV2(input);
  if (!parsed) throw new Error("fixture structured_v2 did not sanitize");
  return parsed;
};

/** Full manager-confirmed coverage — the strongest possible weighted
 *  evidence, so a hard failure that still caps proves non-override. */
const strongSubject: MatchSubject = {
  skills: [
    { uri: "concrete-works", evidence: "manager_confirmed" },
    { uri: "rebar-installation", evidence: "manager_confirmed" },
  ],
  professionSlug: "concrete-worker",
  country: "NL",
  availabilityStatus: "available",
};

const baseNeed: MatchNeed = {
  skillIds: ["concrete-works", "rebar-installation"],
  professionSlug: "concrete-worker",
  country: "NL",
};

const tiers = (r: ReturnType<typeof matchWorkerToNeed>) => ({
  hardMet: r.matchedHard.map((c) => c.criterion),
  blocking: r.blocking.map((c) => c.criterion),
  strengths: r.strengths.map((c) => c.criterion),
  negotiables: r.negotiables.map((c) => c.criterion),
  missing: r.missingFacts.map((m) => `${m.side}:${m.criterion}`),
});

describe("languages — CEFR levels, native, one_per_team demotion", () => {
  const needLang = (
    langs: Record<string, unknown>[],
    targetSupply?: string,
  ): MatchNeed => ({
    ...baseNeed,
    structuredV2: v2({
      ...(targetSupply ? { target_supply: targetSupply } : {}),
      requirements: { languages: langs },
    }),
  });

  it("required level above the worker's stated level → HARD, eligible=false despite full confirmed coverage", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "en", level: "B2" }]), {
      ...strongSubject,
      languageLevels: [{ lang: "en", level: "B1" }],
    });
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(tiers(r).blocking).toContain("language");
    expect(
      r.blocking.find((b) => b.criterion === "language")?.source,
    ).toBe("customer_requests.payload.structured_v2.requirements.languages");
  });

  it("required language entirely missing from the stated set → HARD", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "de", level: "A2" }]), {
      ...strongSubject,
      languageLevels: [{ lang: "en", level: "C1" }],
    });
    expect(r.eligible).toBe(false);
    expect(tiers(r).blocking).toContain("language");
  });

  it("worker level meets / exceeds the requirement → hard criterion met", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "en", level: "B1" }]), {
      ...strongSubject,
      languageLevels: [{ lang: "en", level: "C1" }],
    });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("language");
    expect(r.status).toBe("strong");
  });

  it("native satisfies C2 (native ≥ C2)", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "lt", level: "C2" }]), {
      ...strongSubject,
      languageLevels: [{ lang: "lt", level: "native" }],
    });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("language");
  });

  it("CEFR ordering is exactly A1<A2<B1<B2<C1<C2≤native; unknown levels are null, never guessed", () => {
    const order = ["A1", "A2", "B1", "B2", "C1", "C2", "native"];
    for (let w = 0; w < order.length; w++) {
      for (let req = 0; req < order.length - 1; req++) {
        expect(languageLevelSatisfies(order[w], order[req])).toBe(w >= req);
      }
    }
    expect(languageLevelSatisfies("fluent", "B1")).toBe(null);
    expect(languageLevelSatisfies("B1", "advanced")).toBe(null);
  });

  it("one_per_team_sufficient demotes a failed language to NEGOTIABLE for target_supply=team", () => {
    const r = matchWorkerToNeed(
      needLang([{ lang: "en", level: "B2", one_per_team_sufficient: true }], "team"),
      { ...strongSubject, languageLevels: [{ lang: "lt", level: "native" }] },
    );
    expect(r.eligible).toBe(true);
    expect(tiers(r).blocking).not.toContain("language");
    expect(tiers(r).negotiables).toContain("language");
  });

  it("…and for target_supply=multiple_workers", () => {
    const r = matchWorkerToNeed(
      needLang(
        [{ lang: "en", level: "B2", one_per_team_sufficient: true }],
        "multiple_workers",
      ),
      { ...strongSubject, languageLevels: [{ lang: "lt", level: "native" }] },
    );
    expect(r.eligible).toBe(true);
    expect(tiers(r).negotiables).toContain("language");
  });

  it("…but NOT for an individual target — the requirement stays hard", () => {
    const r = matchWorkerToNeed(
      needLang(
        [{ lang: "en", level: "B2", one_per_team_sufficient: true }],
        "individual",
      ),
      { ...strongSubject, languageLevels: [{ lang: "lt", level: "native" }] },
    );
    expect(r.eligible).toBe(false);
    expect(tiers(r).blocking).toContain("language");
  });

  it("a non-demotable failed language keeps the block even when another is demotable", () => {
    const r = matchWorkerToNeed(
      needLang(
        [
          { lang: "en", level: "B2", one_per_team_sufficient: true },
          { lang: "de", level: "B1" },
        ],
        "team",
      ),
      { ...strongSubject, languageLevels: [{ lang: "lt", level: "native" }] },
    );
    expect(r.eligible).toBe(false);
    expect(tiers(r).blocking).toContain("language");
  });

  it("worker has no stated language facts → worker-side missingFact 'worker_languages', never a block", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "en", level: "B2" }]), strongSubject);
    expect(r.eligible).toBe(true);
    expect(r.blocking).toHaveLength(0);
    expect(r.missingFacts).toContainEqual({
      criterion: "language",
      side: "worker",
      source: "worker_languages",
    });
  });

  it("an extra stated language beyond the requirement is a weighted strength", () => {
    const r = matchWorkerToNeed(needLang([{ lang: "en", level: "B1" }]), {
      ...strongSubject,
      languageLevels: [
        { lang: "en", level: "B2" },
        { lang: "de", level: "A2" },
      ],
    });
    expect(
      r.strengths.some((s) => s.criterion === "language" && s.source === "worker_languages"),
    ).toBe(true);
  });

  it("comparator: no demand language requirements → null (absence = no requirement)", () => {
    expect(compareLanguagesV2(null, [{ lang: "en", level: "B1" }])).toBe(null);
    expect(
      compareLanguagesV2(v2({ engagement_form: "direct_employment" }), [
        { lang: "en", level: "B1" },
      ]),
    ).toBe(null);
  });
});

describe("driving-licence categories — hard when both stated", () => {
  const needLic: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ transport: { licence_categories: ["C", "CE"] } }),
  };

  it("required category not held → HARD, eligible=false regardless of skill coverage", () => {
    const r = matchWorkerToNeed(needLic, {
      ...strongSubject,
      drivingLicenceCategories: ["B"],
    });
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(tiers(r).blocking).toContain("licence_categories");
  });

  it("all required categories held → hard criterion met", () => {
    const r = matchWorkerToNeed(needLic, {
      ...strongSubject,
      drivingLicenceCategories: ["B", "C", "CE"],
    });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("licence_categories");
  });

  it("worker licences unstated (store unapplied or empty) → worker-side missingFact with the workers column source", () => {
    for (const sub of [strongSubject, { ...strongSubject, drivingLicenceCategories: [] }]) {
      const r = matchWorkerToNeed(needLic, sub);
      expect(r.eligible).toBe(true);
      expect(tiers(r).blocking).not.toContain("licence_categories");
      expect(r.missingFacts).toContainEqual({
        criterion: "licence_categories",
        side: "worker",
        source: "workers.driving_licence_categories",
      });
    }
  });
});

describe("own vehicle — required is hard; merely preferred is weighted/negotiable", () => {
  const needRequired: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ transport: { own_vehicle_required: true } }),
  };
  const needPreferred: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ requirements: { own_vehicle: true } }),
  };

  it("required && worker own_vehicle=false → HARD", () => {
    const r = matchWorkerToNeed(needRequired, { ...strongSubject, ownVehicle: false });
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(tiers(r).blocking).toContain("own_vehicle");
  });

  it("required && worker own_vehicle=true → hard criterion met", () => {
    const r = matchWorkerToNeed(needRequired, { ...strongSubject, ownVehicle: true });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("own_vehicle");
  });

  it("required && worker unstated → worker-side missingFact 'workers.own_vehicle'", () => {
    const r = matchWorkerToNeed(needRequired, strongSubject);
    expect(r.eligible).toBe(true);
    expect(r.missingFacts).toContainEqual({
      criterion: "own_vehicle",
      side: "worker",
      source: "workers.own_vehicle",
    });
  });

  it("merely preferred && worker has one → weighted strength (never a gate)", () => {
    const r = matchWorkerToNeed(needPreferred, { ...strongSubject, ownVehicle: true });
    expect(r.eligible).toBe(true);
    expect(tiers(r).strengths).toContain("own_vehicle");
  });

  it("merely preferred && worker has none → NEGOTIABLE, not a block", () => {
    const r = matchWorkerToNeed(needPreferred, { ...strongSubject, ownVehicle: false });
    expect(r.eligible).toBe(true);
    expect(tiers(r).blocking).not.toContain("own_vehicle");
    expect(tiers(r).negotiables).toContain("own_vehicle");
  });
});

describe("own tools — required + stated 'no' is hard", () => {
  const needTools: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ requirements: { own_tools: true } }),
  };

  it("required && worker own_tools=false → HARD, eligible=false", () => {
    const r = matchWorkerToNeed(needTools, { ...strongSubject, ownTools: false });
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(tiers(r).blocking).toContain("own_tools");
  });

  it("required && worker own_tools=true → hard criterion met", () => {
    const r = matchWorkerToNeed(needTools, { ...strongSubject, ownTools: true });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("own_tools");
  });

  it("required && worker unstated → worker-side missingFact 'workers.own_tools'", () => {
    const r = matchWorkerToNeed(needTools, strongSubject);
    expect(r.eligible).toBe(true);
    expect(r.missingFacts).toContainEqual({
      criterion: "own_tools",
      side: "worker",
      source: "workers.own_tools",
    });
  });
});

describe("pay basis (gross/net) — a conversion conversation, never a block", () => {
  const needGross: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({
      compensation: { min_cents: 200000, currency: "EUR", unit: "month", basis: "gross" },
    }),
  };

  it("demand gross vs worker net → NEGOTIABLE, still eligible", () => {
    const r = matchWorkerToNeed(needGross, {
      ...strongSubject,
      payBasisPreference: "net",
    });
    expect(r.eligible).toBe(true);
    expect(tiers(r).blocking).not.toContain("pay_basis");
    expect(tiers(r).negotiables).toContain("pay_basis");
  });

  it("same basis on both sides → weighted strength", () => {
    const r = matchWorkerToNeed(needGross, {
      ...strongSubject,
      payBasisPreference: "gross",
    });
    expect(tiers(r).strengths).toContain("pay_basis");
  });

  it("demand stated, worker unstated → worker-side missingFact 'workers.pay_basis_preference'", () => {
    const r = matchWorkerToNeed(needGross, strongSubject);
    expect(r.missingFacts).toContainEqual({
      criterion: "pay_basis",
      side: "worker",
      source: "workers.pay_basis_preference",
    });
  });

  it("worker stated, demand basis absent/unspecified → demand-side missingFact", () => {
    const needUnspecified: MatchNeed = {
      ...baseNeed,
      structuredV2: v2({
        compensation: { min_cents: 200000, currency: "EUR", unit: "month", basis: "unspecified" },
      }),
    };
    const r = matchWorkerToNeed(needUnspecified, {
      ...strongSubject,
      payBasisPreference: "net",
    });
    expect(r.missingFacts).toContainEqual({
      criterion: "pay_basis",
      side: "demand",
      source: "customer_requests.payload.structured_v2.compensation.basis",
    });
  });

  it("comparator: a stored value outside gross|net is unknown, never guessed", () => {
    expect(
      comparePayBasisV2(
        v2({ compensation: { min_cents: 100000, basis: "gross" } }),
        "whatever",
      ),
    ).toEqual({ kind: "worker_unstated" });
    expect(comparePayBasisV2(null, null)).toBe(null);
  });
});

describe("night / weekend shifts — stated refusal of a stated shift is hard", () => {
  const needNight: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ time: { shifts: ["day", "night"] } }),
  };
  const needWeekend: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ time: { shifts: ["weekend"] } }),
  };

  it("demand includes night && night_shifts_ok=false → HARD, eligible=false", () => {
    const r = matchWorkerToNeed(needNight, { ...strongSubject, nightShiftsOk: false });
    expect(r.eligible).toBe(false);
    expect(r.status).toBe("weak");
    expect(tiers(r).blocking).toContain("night_shifts");
    expect(
      r.blocking.find((b) => b.criterion === "night_shifts")?.source,
    ).toBe("customer_requests.payload.structured_v2.time.shifts");
  });

  it("demand includes night && night_shifts_ok=true → hard criterion met", () => {
    const r = matchWorkerToNeed(needNight, { ...strongSubject, nightShiftsOk: true });
    expect(r.eligible).toBe(true);
    expect(tiers(r).hardMet).toContain("night_shifts");
  });

  it("demand includes night && worker unstated → worker-side missingFact 'workers.night_shifts_ok'", () => {
    const r = matchWorkerToNeed(needNight, strongSubject);
    expect(r.eligible).toBe(true);
    expect(r.missingFacts).toContainEqual({
      criterion: "night_shifts",
      side: "worker",
      source: "workers.night_shifts_ok",
    });
  });

  it("weekend analog: refusal → HARD; acceptance → met; unstated → missingFact", () => {
    const blocked = matchWorkerToNeed(needWeekend, {
      ...strongSubject,
      weekendShiftsOk: false,
    });
    expect(blocked.eligible).toBe(false);
    expect(tiers(blocked).blocking).toContain("weekend_shifts");

    const ok = matchWorkerToNeed(needWeekend, { ...strongSubject, weekendShiftsOk: true });
    expect(ok.eligible).toBe(true);
    expect(tiers(ok).hardMet).toContain("weekend_shifts");

    const unknown = matchWorkerToNeed(needWeekend, strongSubject);
    expect(unknown.missingFacts).toContainEqual({
      criterion: "weekend_shifts",
      side: "worker",
      source: "workers.weekend_shifts_ok",
    });
  });

  it("demand states shifts WITHOUT night → no night requirement, nothing recorded for it", () => {
    const r = matchWorkerToNeed(needWeekend, { ...strongSubject, nightShiftsOk: false });
    expect(tiers(r).blocking).not.toContain("night_shifts");
    expect(tiers(r).missing).not.toContain("worker:night_shifts");
  });

  it("worker stated a shift preference but the demand has not stated its shifts → demand-side missingFact '…time.shifts'", () => {
    const r = matchWorkerToNeed(baseNeed, {
      ...strongSubject,
      nightShiftsOk: true,
      weekendShiftsOk: false,
    });
    expect(r.missingFacts).toContainEqual({
      criterion: "night_shifts",
      side: "demand",
      source: "customer_requests.payload.structured_v2.time.shifts",
    });
    expect(r.missingFacts).toContainEqual({
      criterion: "weekend_shifts",
      side: "demand",
      source: "customer_requests.payload.structured_v2.time.shifts",
    });
    expect(r.eligible).toBe(true);
  });
});

describe("overtime — commonly negotiated, never a block", () => {
  const needOvertime: MatchNeed = {
    ...baseNeed,
    structuredV2: v2({ time: { overtime_expected: true } }),
  };

  it("expected && worker overtime_ok=false → NEGOTIABLE, still eligible", () => {
    const r = matchWorkerToNeed(needOvertime, { ...strongSubject, overtimeOk: false });
    expect(r.eligible).toBe(true);
    expect(tiers(r).blocking).not.toContain("overtime");
    expect(tiers(r).negotiables).toContain("overtime");
    expect(r.status).toBe("strong"); // negotiables never silently downgrade
  });

  it("expected && worker overtime_ok=true → weighted strength", () => {
    const r = matchWorkerToNeed(needOvertime, { ...strongSubject, overtimeOk: true });
    expect(tiers(r).strengths).toContain("overtime");
  });

  it("expected && worker unstated → worker-side missingFact 'workers.overtime_ok'", () => {
    const r = matchWorkerToNeed(needOvertime, strongSubject);
    expect(r.missingFacts).toContainEqual({
      criterion: "overtime",
      side: "worker",
      source: "workers.overtime_ok",
    });
  });

  it("worker stated, demand silent on overtime → demand-side missingFact '…time.overtime_expected'", () => {
    const r = matchWorkerToNeed(baseNeed, { ...strongSubject, overtimeOk: true });
    expect(r.missingFacts).toContainEqual({
      criterion: "overtime",
      side: "demand",
      source: "customer_requests.payload.structured_v2.time.overtime_expected",
    });
  });

  it("overtime_expected=false is a stated 'no overtime' — nothing to check, nothing recorded", () => {
    const r = matchWorkerToNeed(
      { ...baseNeed, structuredV2: v2({ time: { overtime_expected: false } }) },
      { ...strongSubject, overtimeOk: false },
    );
    expect(tiers(r).blocking).not.toContain("overtime");
    expect(tiers(r).negotiables).not.toContain("overtime");
    expect(tiers(r).missing).not.toContain("demand:overtime");
  });
});

describe("cross-dimension invariants", () => {
  it("ONE hard dimension failure caps everything even when every other dimension is met", () => {
    const need: MatchNeed = {
      ...baseNeed,
      structuredV2: v2({
        target_supply: "individual",
        requirements: {
          languages: [{ lang: "en", level: "B1" }],
          own_tools: true,
          own_vehicle: true,
        },
        transport: { licence_categories: ["B"], own_vehicle_required: true },
        compensation: { min_cents: 200000, currency: "EUR", unit: "month", basis: "gross" },
        time: { shifts: ["night", "weekend"], overtime_expected: true },
      }),
    };
    const perfect: MatchSubject = {
      ...strongSubject,
      languageLevels: [{ lang: "en", level: "C1" }],
      drivingLicenceCategories: ["B"],
      ownVehicle: true,
      ownTools: true,
      payBasisPreference: "gross",
      nightShiftsOk: true,
      weekendShiftsOk: true,
      overtimeOk: true,
      salaryMinEur: 1800,
    };
    const allMet = matchWorkerToNeed(need, perfect);
    expect(allMet.eligible).toBe(true);
    expect(allMet.status).toBe("strong");
    expect(allMet.blocking).toHaveLength(0);

    const oneRefusal = matchWorkerToNeed(need, { ...perfect, nightShiftsOk: false });
    expect(oneRefusal.eligible).toBe(false);
    expect(oneRefusal.status).toBe("weak");
    expect(tiers(oneRefusal).blocking).toEqual(["night_shifts"]);
  });

  it("every v2.1 record and missing fact carries the closed shape + a real table/field source", () => {
    const need: MatchNeed = {
      ...baseNeed,
      structuredV2: v2({
        requirements: { languages: [{ lang: "en", level: "B2" }], own_tools: true },
        transport: { licence_categories: ["CE"] },
        time: { shifts: ["night"], overtime_expected: true },
        compensation: { min_cents: 150000, unit: "month", basis: "net" },
      }),
    };
    const r = matchWorkerToNeed(need, strongSubject);
    for (const c of [...r.matchedHard, ...r.blocking, ...r.strengths, ...r.negotiables]) {
      expect(Object.keys(c).sort()).toEqual(["class", "criterion", "outcome", "source"]);
      expect(c.source.trim().length).toBeGreaterThan(0);
    }
    for (const m of r.missingFacts) {
      expect(["worker", "demand"]).toContain(m.side);
      expect(m.source.trim().length).toBeGreaterThan(0);
    }
    // No duplicate missing-fact entries (legacy + v2 language checks dedupe).
    const keys = r.missingFacts.map((m) => `${m.criterion}|${m.side}|${m.source}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("determinism: same inputs twice → deep-equal output across all eight dimensions", () => {
    const need: MatchNeed = {
      ...baseNeed,
      structuredV2: v2({
        target_supply: "team",
        requirements: {
          languages: [
            { lang: "en", level: "B2", one_per_team_sufficient: true },
            { lang: "de", level: "A2" },
          ],
          own_tools: true,
          own_vehicle: true,
        },
        transport: { licence_categories: ["B", "CE"] },
        compensation: { min_cents: 180000, currency: "EUR", unit: "month", basis: "gross" },
        time: { shifts: ["night", "weekend"], overtime_expected: true, hours_per_week: 45 },
      }),
    };
    const subject: MatchSubject = {
      ...strongSubject,
      languageLevels: [{ lang: "de", level: "B1" }],
      drivingLicenceCategories: ["B"],
      ownVehicle: false,
      ownTools: true,
      payBasisPreference: "net",
      nightShiftsOk: true,
      weekendShiftsOk: false,
      overtimeOk: false,
      salaryMinEur: 1900,
    };
    const a = matchWorkerToNeed(need, subject);
    const b = matchWorkerToNeed(need, subject);
    expect(a).toEqual(b);
    expect(a.calcVersion).toBe("2.1");
  });

  it("calcVersion '2.1' is stamped on results with and without v2 dimensions", () => {
    expect(MATCH_CALC_VERSION).toBe("2.1");
    expect(matchWorkerToNeed(baseNeed, strongSubject).calcVersion).toBe("2.1");
    expect(matchWorkerToNeed({}, strongSubject).calcVersion).toBe("2.1");
  });
});
