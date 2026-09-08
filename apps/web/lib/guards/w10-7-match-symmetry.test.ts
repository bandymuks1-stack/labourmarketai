import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  matchWorkerToNeed,
  type MatchNeed,
  type MatchResultV1,
  type MatchSubject,
} from "@/lib/market/match-v1";
import {
  needFromDemandRow,
  needFromRoleText,
} from "@/lib/opportunities/opportunity-need";
import {
  buildNeedFromRequestRow,
  type NeedSourceRow,
} from "@/lib/market/need-from-request";

/**
 * W10 SLICE 7 — MATCH-SYMMETRY GUARD (audit §5.2 / §5.3, slice list).
 *
 * ONE canonical fixture runs through BOTH need builders and BOTH subject
 * shapes, into the ONE engine (`matchWorkerToNeed`), and the guard asserts
 * that the resulting `MatchResultV1.status` and `blocking` are identical —
 * except for the asymmetries the product DELIBERATELY carries, which are
 * pinned exactly (not flattened). Any new divergence between the worker-board
 * path and the scouting path fails here at write time. This is the test that
 * would have caught P0-1 (board matched on a need stripped of structured_v2)
 * and both known asymmetries.
 *
 * The two paths:
 *   Path A (worker board):  needFromRoleText / needFromDemandRow
 *                           (lib/opportunities/opportunity-need.ts)
 *                           + the worker's OWN subject
 *                           (lib/opportunities/worker-subject.ts).
 *   Path B (scouting):      buildNeedFromRequestRow
 *                           (lib/market/need-from-request.ts)
 *                           + the supply-side subject
 *                           (lib/market/match-subject.ts).
 *
 * PINNED DELIBERATE ASYMMETRIES:
 *
 *  §5.2 — city tier is worker-side ONLY (privacy doctrine §20). The worker's
 *  city comes from `preferred_locations`, an own-rows table an employer must
 *  never read; `buildSupplyCandidates` therefore NEVER sets `subject.city`,
 *  so `city_match` can fire on the worker board but never in scouting (the
 *  supply side degrades honestly to the country tier). The guard pins that
 *  this is the ONLY behavioural divergence when a city is present, and pins
 *  the builders' SOURCE so the boundary cannot silently move.
 *
 *  §5.3 — the worker-board need is REDUCED. `needFromRoleText` derives from
 *  role text only and drops, relative to `buildNeedFromRequestRow` for the
 *  same row, exactly: `escoSkillUris`, `languages`, `structuredV2`. The
 *  P0-1 fix (`needFromDemandRow`) restored `structuredV2`; `escoSkillUris`
 *  and `languages` remain dropped (the board row shape does not carry
 *  `language_requirement` or human-picked ESCO URIs). The guard pins the
 *  exact drop-lists field-by-field so any NEW silent drop fails, and proves
 *  the reduction is consequential (an engagement-form conflict blocks in
 *  scouting but is invisible to the role-text-only need).
 *
 * PURITY NOTE (why the subject halves are mirrored, not called): both subject
 * builders are impure end-to-end — `server-only` modules that read Supabase
 * (worker-subject.ts reads the request-cached core row + preferred_locations;
 * match-subject.ts runs staged retrieval). They export no pure row→subject
 * mapping. So this guard (a) mirrors each builder's subject-literal assembly
 * in local fixtures fed from ONE set of worker facts, and (b) pins each
 * builder's SOURCE by regex (city / preferred_locations / salaryMinEur /
 * experienceYears) so the mirrors cannot drift from the real builders
 * unnoticed. The need halves and the engine are exercised for real — they
 * are pure.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

/** Role text the offline recognizer resolves to a non-empty requirement set
 *  (same fixture text as lib/guards/location-matching.test.ts). */
const ROLE = "warehouse worker order picking";
const COUNTRY = "LT";
const CITY = "Vilnius";

/** ONE set of worker facts both subject mirrors are fed from. */
interface WorkerFacts {
  readonly skillSlugs: readonly string[];
  readonly professionSlug: string | null;
  readonly country: string;
  /** From the worker's OWN preferred_locations rows (§20 own-rows). */
  readonly preferredCity: string | null;
  readonly preferredContractType: string | null;
}

/** Mirrors buildOwnWorkerContext's subject literal
 *  (lib/opportunities/worker-subject.ts) — carries `city`, carries NO
 *  salaryMinEur / experienceYears. Source-pinned below. */
function workerSideSubject(f: WorkerFacts): MatchSubject {
  return {
    skills: f.skillSlugs.map((uri) => ({ uri, evidence: "manager_confirmed" as const })),
    professionSlug: f.professionSlug,
    country: f.country,
    city: f.preferredCity,
    preferredCountries: [],
    availabilityStatus: "available",
    availableFrom: null,
    preferredContractType: f.preferredContractType,
    languageLevels: null,
    drivingLicenceCategories: null,
    ownVehicle: null,
    ownTools: null,
    payBasisPreference: null,
    nightShiftsOk: null,
    weekendShiftsOk: null,
    overtimeOk: null,
  };
}

/** Mirrors buildSupplyCandidates' subject literal
 *  (lib/market/match-subject.ts) — NEVER a `city` (privacy §20), but carries
 *  salaryMinEur + experienceYears. Source-pinned below. */
function supplySideSubject(f: WorkerFacts): MatchSubject {
  return {
    skills: f.skillSlugs.map((uri) => ({ uri, evidence: "manager_confirmed" as const })),
    professionSlug: f.professionSlug,
    country: f.country,
    preferredCountries: [],
    availabilityStatus: "available",
    availableFrom: null,
    salaryMinEur: null,
    preferredContractType: f.preferredContractType,
    experienceYears: null,
    languageLevels: null,
    drivingLicenceCategories: null,
    ownVehicle: null,
    ownTools: null,
    payBasisPreference: null,
    nightShiftsOk: null,
    weekendShiftsOk: null,
    overtimeOk: null,
  };
}

/** The scouting-side row twin of the SAME demand facts. */
function requestRow(overrides: Partial<NeedSourceRow> = {}): NeedSourceRow {
  return {
    title: null,
    need_summary: null,
    role_or_work_type: ROLE,
    notes: null,
    country: COUNTRY,
    location: null,
    language_requirement: null,
    payload: null,
    ...overrides,
  };
}

function factsFor(need: MatchNeed, overrides: Partial<WorkerFacts> = {}): WorkerFacts {
  return {
    skillSlugs: need.skillIds ?? [],
    professionSlug: need.professionSlug ?? null,
    country: COUNTRY,
    preferredCity: null,
    preferredContractType: null,
    ...overrides,
  };
}

type Criterion = MatchResultV1["strengths"][number];
const criterionShape = (c: Criterion) => `${c.criterion}:${c.class}:${c.outcome}`;

describe("w10-7 §5.2/§5.3 — city-neutral fixture: both paths are IDENTICAL", () => {
  it("same fixture through both need builders + both subject shapes → same MatchResultV1 (status, blocking, everything)", () => {
    const { need: needA } = needFromRoleText(ROLE, COUNTRY, null);
    const { need: needB } = buildNeedFromRequestRow(requestRow(), new Map());

    // The fixture must be meaningful: a real, identical requirement set.
    expect(needA.skillIds?.length ?? 0).toBeGreaterThan(0);
    expect([...(needB.skillIds ?? [])]).toEqual([...(needA.skillIds ?? [])]);
    expect(needB.professionSlug ?? null).toBe(needA.professionSlug ?? null);
    expect(needB.needSource).toBe(needA.needSource);

    const facts = factsFor(needA);
    const resA = matchWorkerToNeed(needA, workerSideSubject(facts));
    const resB = matchWorkerToNeed(needB, supplySideSubject(facts));

    // The slice's core assertion: status AND blocking identical.
    expect(resA.status).toBe(resB.status);
    expect(resA.blocking).toEqual(resB.blocking);
    // And in a city-neutral fixture there is NO deliberate asymmetry left, so
    // the ENTIRE result must be identical. Any new divergence between the
    // worker-board path and the scouting path fails right here.
    expect(resA).toEqual(resB);

    // Fixture sanity: full confirmed coverage on an unblocked need is strong.
    expect(resA.status).toBe("strong");
    expect(resA.eligible).toBe(true);
  });
});

describe("w10-7 §5.2 — pinned asymmetry: city tier fires worker-side ONLY", () => {
  it("with a city on BOTH sides' inputs, the worker path gets city_match, the supply path country_match — and NOTHING else diverges", () => {
    const { need: needA } = needFromRoleText(ROLE, COUNTRY, CITY);
    const { need: needB } = buildNeedFromRequestRow(
      requestRow({ location: CITY }),
      new Map(),
    );
    expect(needA.city).toBe(CITY);
    expect(needB.city).toBe(CITY); // BOTH needs know the city…

    const facts = factsFor(needA, { preferredCity: CITY });
    const resA = matchWorkerToNeed(needA, workerSideSubject(facts));
    const resB = matchWorkerToNeed(needB, supplySideSubject(facts));

    // …but only the worker-side SUBJECT does (§20: preferred_locations is
    // own-rows; the supply builder never assembles a city).
    const codesA = resA.reasons.map((r) => r.code);
    const codesB = resB.reasons.map((r) => r.code);
    expect(codesA).toContain("city_match");
    expect(codesA).not.toContain("country_match");
    expect(codesB).toContain("country_match");
    expect(codesB).not.toContain("city_match");

    // Pin EXACTLY that difference and nothing else:
    expect(codesA.filter((c) => c !== "city_match")).toEqual(
      codesB.filter((c) => c !== "country_match"),
    );
    expect(resA.status).toBe(resB.status);
    expect(resA.eligible).toBe(resB.eligible);
    expect(resA.blocking).toEqual(resB.blocking);
    expect(resA.gaps).toEqual(resB.gaps);
    expect(resA.missingData).toEqual(resB.missingData);
    expect(resA.missingFacts).toEqual(resB.missingFacts);
    expect(resA.negotiables).toEqual(resB.negotiables);
    expect(resA.matchedHard).toEqual(resB.matchedHard);
    expect(resA.skillFit).toEqual(resB.skillFit);

    // Strengths: same criterion/class/outcome sequence; the ONE permitted
    // difference is the country_location provenance (city tier vs country
    // tier). Everything else is byte-identical.
    expect(resA.strengths.map(criterionShape)).toEqual(resB.strengths.map(criterionShape));
    const locA = resA.strengths.find((s) => s.criterion === "country_location");
    const locB = resB.strengths.find((s) => s.criterion === "country_location");
    expect(locA?.source).toBe("preferred_locations.city");
    expect(locB?.source).toBe("workers.current_location_country");
    expect(resA.strengths.filter((s) => s.criterion !== "country_location")).toEqual(
      resB.strengths.filter((s) => s.criterion !== "country_location"),
    );
  });

  it("SOURCE pin: the supply builder never assembles a subject city and never reads preferred_locations; the worker builder does exactly that", () => {
    // The subject builders are impure (server-only + Supabase), so the privacy
    // boundary is pinned at source level — the fixtures above mirror these
    // assemblies, and this pin keeps the mirrors honest.
    const supplySrc = stripComments(read("lib/market/match-subject.ts"));
    expect(supplySrc).not.toMatch(/\bcity\s*:/);
    expect(supplySrc).not.toMatch(/preferred_locations/);

    const workerSrc = stripComments(read("lib/opportunities/worker-subject.ts"));
    expect(workerSrc).toMatch(/city:\s*preferredCity/);
    expect(workerSrc).toMatch(/from\("preferred_locations"\)/);
  });

  it("SOURCE pin: the remaining subject-shape diff is exactly {salaryMinEur, experienceYears} (supply-side only)", () => {
    // Observed (not doctrine-mandated) asymmetry, pinned so it can only change
    // DELIBERATELY: the worker's own subject omits salaryMinEur and
    // experienceYears, the supply subject carries both. Closing or widening
    // this gap must update this guard.
    const workerSrc = stripComments(read("lib/opportunities/worker-subject.ts"));
    expect(workerSrc).not.toMatch(/salaryMinEur/);
    expect(workerSrc).not.toMatch(/experienceYears/);

    const supplySrc = stripComments(read("lib/market/match-subject.ts"));
    expect(supplySrc).toMatch(/salaryMinEur:/);
    expect(supplySrc).toMatch(/experienceYears:/);
  });
});

describe("w10-7 §5.3 — pinned asymmetry: the worker-board need is REDUCED", () => {
  /** A maximal demand row: every field the scouting builder can consume. */
  const MAXIMAL_ROW = requestRow({
    title: "Sandėlio darbuotojas",
    need_summary: ROLE,
    notes: "night shifts possible",
    location: CITY,
    language_requirement: "English, Russian",
    payload: {
      structured_v2: {
        engagement_form: "company_subcontract",
        meta: { contract_version: 2 },
      },
    },
  });

  it("needFromRoleText drops EXACTLY {escoSkillUris, languages, structuredV2} relative to buildNeedFromRequestRow", () => {
    const { need: reduced } = needFromRoleText(ROLE, COUNTRY, CITY);
    const { need: full } = buildNeedFromRequestRow(MAXIMAL_ROW, new Map());

    // Pin both shapes field-by-field. A new MatchNeed field that reaches only
    // ONE builder shows up as a changed key set here — a silent drop fails.
    expect(Object.keys(reduced).sort()).toEqual([
      "city",
      "country",
      "needSource",
      "professionSlug",
      "skillIds",
    ]);
    expect(Object.keys(full).sort()).toEqual([
      "city",
      "country",
      "escoSkillUris",
      "languages",
      "needSource",
      "professionSlug",
      "skillIds",
      "structuredV2",
    ]);
    const dropped = Object.keys(full).filter((k) => !(k in reduced));
    expect(dropped.sort()).toEqual(["escoSkillUris", "languages", "structuredV2"]);

    // The dropped fields carry REAL demand facts on the scouting path:
    expect(full.languages).toEqual(["English", "Russian"]);
    expect(full.structuredV2?.engagement_form).toBe("company_subcontract");
  });

  it("needFromDemandRow (the P0-1 fix) restores structuredV2; the remaining drop-list is EXACTLY {escoSkillUris, languages}, and `languages` is now DECLARED as unknown", () => {
    const { need: board } = needFromDemandRow({
      role_text: ROLE,
      country: COUNTRY,
      location_label: CITY,
    });
    const { need: full } = buildNeedFromRequestRow(MAXIMAL_ROW, new Map());
    expect(Object.keys(board).sort()).toEqual([
      "city",
      "country",
      // W10 — the reduction is declared, not silent. This key exists ONLY on
      // the reduced builder, on purpose: it is the board saying "I cannot see
      // customer_requests.language_requirement", which is true by construction
      // of the gated RPC row it builds from.
      "languageRequirementUnknown",
      "needSource",
      // 2026-09-04 (owner contract §15): the DECLARED opportunity type rides
      // the board need for DISCOVERY ("kur galiu atlikti praktiką?" → only
      // internships). Carried, never a matching input; null when not stated.
      "opportunityType",
      "professionSlug",
      "skillIds",
      "structuredV2",
    ]);
    expect(board.languageRequirementUnknown).toBe(true);
    // The scouting builder reads the column, so it must NEVER claim unknown.
    expect(full.languageRequirementUnknown).toBeUndefined();

    const dropped = Object.keys(full).filter((k) => !(k in board));
    expect(dropped.sort()).toEqual(["escoSkillUris", "languages"]);
  });

  it("the `languages` drop is CONSEQUENTIAL — and the board now says so instead of staying silent", () => {
    // A demand that stated its languages in the LEGACY column and not in
    // structured v2, matched against a worker who speaks neither. This is the
    // exact shape the two paths disagreed about.
    const LANG_ROW = requestRow({
      language_requirement: "English, Russian",
      payload: null,
    });
    const facts = factsFor(needFromRoleText(ROLE, COUNTRY, null).need);
    // The subject mirrors carry no `languages` field (neither real builder
    // sets one on this path), so it is stated explicitly here — the point of
    // the test is the DEMAND side, and an unknown worker side would mask it.
    const speaksOnlyLt = { languages: ["lt"] as readonly string[] };

    const { need: scouting } = buildNeedFromRequestRow(LANG_ROW, new Map());
    const resScouting = matchWorkerToNeed(scouting, {
      ...supplySideSubject(facts),
      ...speaksOnlyLt,
    });

    // Scouting reads the column: a required language the worker lacks is a
    // HARD block, so the match cannot be better than weak.
    expect(resScouting.blocking.map((b) => b.criterion)).toContain("language");
    expect(resScouting.eligible).toBe(false);
    expect(resScouting.status).toBe("weak");

    const { need: board } = needFromDemandRow({
      role_text: ROLE,
      country: COUNTRY,
      location_label: null,
    });
    const resBoard = matchWorkerToNeed(board, {
      ...workerSideSubject(facts),
      ...speaksOnlyLt,
    });

    // The board still cannot BLOCK — it never receives the requirement, and
    // the engine's doctrine is that an absent fact degrades to unknown, never
    // to "not met". What changed is that the absence is now REPORTED on the
    // demand side, on the same card that prints the tier, rather than reading
    // as "this demand requires no languages".
    expect(resBoard.missingData).toContain("language_requirement_unknown");
    expect(
      resBoard.missingFacts.some(
        (m) => m.criterion === "language" && m.side === "demand",
      ),
    ).toBe(true);
  });

  it("a demand that DID state languages in structured v2 is not reported as unknown", () => {
    // The v2 CEFR check evaluates the real requirement on both paths, so
    // claiming "unknown" there would be noise — and worse, wrong.
    const { need: board } = needFromDemandRow({
      role_text: ROLE,
      country: COUNTRY,
      location_label: null,
      structured: {
        requirements: { languages: [{ lang: "en", level: "B2" }] },
      },
    });
    // The flag is still set — this builder genuinely cannot read the legacy
    // column — but the ENGINE suppresses the report, because the demand did
    // state a requirement and the v2 CEFR check evaluates it.
    expect(board.languageRequirementUnknown).toBe(true);
    expect(board.structuredV2?.requirements?.languages?.length).toBe(1);

    const facts = factsFor(board);
    const res = matchWorkerToNeed(board, {
      ...workerSideSubject(facts),
      languages: ["lt"] as readonly string[],
    });
    expect(res.missingData).not.toContain("language_requirement_unknown");
  });

  it("the reduction is consequential: an engagement-form conflict BLOCKS scouting but is invisible to the role-text need", () => {
    // Same row, same worker. The payload states company_subcontract; the
    // worker prefers employment → a both-sides-stated hard conflict.
    const V2_ROW = requestRow({
      payload: {
        structured_v2: {
          engagement_form: "company_subcontract",
          meta: { contract_version: 2 },
        },
      },
    });
    const { need: needA } = needFromRoleText(ROLE, COUNTRY, null);
    const { need: needB } = buildNeedFromRequestRow(V2_ROW, new Map());
    expect(needB.structuredV2?.engagement_form).toBe("company_subcontract");
    expect([...(needB.skillIds ?? [])]).toEqual([...(needA.skillIds ?? [])]);

    const facts = factsFor(needA, { preferredContractType: "employment" });
    const resA = matchWorkerToNeed(needA, workerSideSubject(facts));
    const resB = matchWorkerToNeed(needB, supplySideSubject(facts));

    // Scouting sees the stated conflict and blocks hard…
    expect(resB.blocking.map((b) => b.criterion)).toContain("engagement_form");
    expect(resB.eligible).toBe(false);
    expect(resB.status).toBe("weak");

    // …the reduced role-text need never even evaluates the criterion. This is
    // the P0-1 failure mode, pinned: a worker card computed from the reduced
    // need can say "strong" about a demand whose own payload disqualifies it.
    const criteriaA = [
      ...resA.matchedHard,
      ...resA.blocking,
      ...resA.strengths,
      ...resA.negotiables,
    ].map((c) => c.criterion);
    expect(criteriaA).not.toContain("engagement_form");
    expect(resA.eligible).toBe(true);
    expect(resA.status).toBe("strong");
  });
});
