/**
 * Guard — worker board structured demand detail (Marketplace Precision
 * Phase-2 PR 2).
 *
 * Pins the worker-safe rendering contract for the MP-3 `structured` RPC
 * column (draft migration 20260711330000, human-gated):
 *
 *  1. The public reader is a strict SUBSET of the capture-side contract —
 *     free-text keys (bonuses_note, worksite_type, certificates, deduction
 *     notes) can NEVER reach a worker surface, even if a malicious/legacy
 *     payload smuggles them into the row.
 *  2. Tolerance: missing field / garbage shapes → null; element-by-element
 *     drop for arrays (the SQL helper's semantics). Never throws, never
 *     fabricates.
 *  3. The worker-facing honesty gaps derive from the SAME rule set the
 *     company saw at publish time (missing minimum / basis / guaranteed
 *     hours / deductions) — one derivation, no drift.
 *  4. The board renders the talent-pool disclosure whenever
 *     process.listing_kind === 'talent_pool', and an honest "not provided"
 *     line when the projection is absent (source-scan pinned).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  derivePublicHonestyGaps,
  publicPayRange,
  publicRequiresTalentPoolDisclosure,
  readStructuredDemandPublic,
} from "@/lib/opportunities/structured-public";
import {
  deriveCompensationHonestyFlags,
  sanitizeStructuredDemandV2,
} from "@/lib/demand/structured-demand-v2";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** A worker-safe cluster as the applied SQL helper would project it. */
const PUBLIC_VALID = {
  opportunity_type: "employment",
  engagement_form: "posted_worker",
  contract_country: "NL",
  time: {
    start_earliest: "2026-08-01",
    start_latest: "2026-08-15",
    hours_per_week: 40,
    min_guaranteed_hours: 30,
    shifts: ["day", "weekend"],
    application_deadline: "2026-07-25",
  },
  compensation: {
    min_cents: 1450,
    max_cents: 1800,
    currency: "EUR",
    basis: "gross",
    unit: "hour",
    deductions: [{ kind: "accommodation", amount_cents: 9000, period: "week" }],
  },
  accommodation: { state: "offered", payer: "shared", price_cents: 9000 },
  transport: { international_travel: "compensated", daily: "provided" },
  requirements: {
    min_experience_years: 2,
    languages: [{ lang: "en", level: "B1" }],
    own_tools: true,
  },
  process: { listing_kind: "active_vacancy", response_deadline_days: 7 },
};

describe("readStructuredDemandPublic — free text can never reach a worker", () => {
  it("strips every excluded free-text key, element by element", () => {
    const smuggled = {
      structured: {
        ...PUBLIC_VALID,
        worksite_type: "call me at +370600LEAK",
        right_to_work_notes: "leak",
        compensation: {
          ...PUBLIC_VALID.compensation,
          bonuses_note: "secret bonus text",
          overtime_rate_note: "1.5x — call for details",
          deductions: [
            { kind: "accommodation", amount_cents: 9000, period: "week", note: "leaky note" },
          ],
        },
        requirements: {
          ...PUBLIC_VALID.requirements,
          certificates: ["Safety card — call +370"],
        },
        process: { ...PUBLIC_VALID.process, decision_owner: "Jonas" },
        meta: { contract_version: 2 },
      },
    };
    const parsed = readStructuredDemandPublic(smuggled);
    expect(parsed).not.toBeNull();
    const json = JSON.stringify(parsed);
    // The structured facts survive…
    expect(parsed?.compensation?.min_cents).toBe(1450);
    expect(parsed?.compensation?.deductions?.[0]?.kind).toBe("accommodation");
    expect(parsed?.requirements?.languages?.[0]?.level).toBe("B1");
    // …but NO excluded key or free-text value does.
    for (const leak of [
      "worksite_type",
      "right_to_work_notes",
      "bonuses_note",
      "overtime_rate_note",
      "certificates",
      "decision_owner",
      "note",
      "meta",
      "LEAK",
      "secret bonus text",
      "leaky note",
      "Safety card",
      "Jonas",
    ]) {
      expect(json, `leaked: ${leak}`).not.toContain(leak);
    }
  });

  it("drops invalid enum values / wrong types without rejecting the rest", () => {
    const parsed = readStructuredDemandPublic({
      structured: {
        engagement_form: "gig_platform", // out of vocabulary → dropped
        contract_country: "Netherlands", // not ISO-2 → dropped
        time: { hours_per_week: "40", start_earliest: "2026-08-01" },
        compensation: { min_cents: 1450, currency: "eur" },
        requirements: {
          languages: [
            { lang: "xx", level: "B1" }, // bad lang → element dropped
            { lang: "lt", level: "C1" },
          ],
        },
      },
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.engagement_form).toBeUndefined();
    expect(parsed?.contract_country).toBeUndefined();
    expect(parsed?.time).toEqual({ start_earliest: "2026-08-01" });
    expect(parsed?.compensation).toEqual({ min_cents: 1450 });
    expect(parsed?.requirements?.languages).toEqual([{ lang: "lt", level: "C1" }]);
  });
});

describe("readStructuredDemandPublic — null tolerance (pre-apply rows, garbage)", () => {
  it("returns null when the RPC row has no structured field (migration not applied)", () => {
    expect(readStructuredDemandPublic({ id: "x", role_text: "concrete-works" })).toBeNull();
  });

  it("returns null (never throws, never fabricates) for garbage shapes", () => {
    expect(readStructuredDemandPublic(null)).toBeNull();
    expect(readStructuredDemandPublic(undefined)).toBeNull();
    expect(readStructuredDemandPublic("row")).toBeNull();
    expect(readStructuredDemandPublic({ structured: null })).toBeNull();
    expect(readStructuredDemandPublic({ structured: "corrupted" })).toBeNull();
    expect(readStructuredDemandPublic({ structured: 42 })).toBeNull();
    expect(readStructuredDemandPublic({ structured: [] })).toBeNull();
    expect(readStructuredDemandPublic({ structured: {} })).toBeNull();
    // Nothing whitelisted survives → honest null, not an empty husk.
    expect(
      readStructuredDemandPublic({
        structured: { worksite_type: "leak", compensation: { bonuses_note: "x" } },
      }),
    ).toBeNull();
  });
});

describe("honesty gaps — ONE derivation shared with the capture side", () => {
  const cases: Array<Record<string, unknown>> = [
    // Complete pay facts → no gaps.
    {
      compensation: {
        min_cents: 1450,
        basis: "gross",
        no_deductions: true,
      },
      time: { min_guaranteed_hours: 40 },
    },
    // Lone "up to" amount → missing_minimum + max_without_min (+ others).
    { compensation: { max_cents: 2500, currency: "EUR", basis: "gross" } },
    // Unspecified basis is a gap, not a fact.
    {
      compensation: { min_cents: 1400, basis: "unspecified", no_deductions: true },
      time: { min_guaranteed_hours: 40 },
    },
    // Deductions itemized clears missing_deductions.
    {
      compensation: {
        min_cents: 1450,
        basis: "net",
        deductions: [{ kind: "transport", amount_cents: 500, period: "week" }],
      },
      time: { min_guaranteed_hours: 30 },
    },
  ];

  it("public gaps equal the capture-side flags for the same cluster", () => {
    for (const input of cases) {
      const captureSide = deriveCompensationHonestyFlags(sanitizeStructuredDemandV2(input));
      const workerSide = derivePublicHonestyGaps(
        readStructuredDemandPublic({ structured: input }),
      );
      expect(workerSide, JSON.stringify(input)).toEqual(captureSide);
    }
  });

  it("no projection at all still shows every pay gap (workers see the silence)", () => {
    expect(derivePublicHonestyGaps(null)).toEqual(deriveCompensationHonestyFlags(null));
    expect(derivePublicHonestyGaps(null)).toEqual([
      "missing_minimum",
      "missing_basis",
      "missing_guaranteed_hours",
      "missing_deductions",
    ]);
  });

  it("pay range helper never invents an amount", () => {
    expect(publicPayRange(undefined)).toBeNull();
    expect(publicPayRange({})).toBeNull();
    expect(publicPayRange({ min_cents: 1450, max_cents: 1800 })).toEqual({
      kind: "range",
      min: "14.50",
      max: "18",
    });
    expect(publicPayRange({ max_cents: 2500 })).toEqual({ kind: "up_to", max: "25" });
  });
});

describe("talent-pool disclosure — mandatory, source-pinned", () => {
  it("the predicate keys on listing_kind === 'talent_pool' only", () => {
    expect(
      publicRequiresTalentPoolDisclosure(
        readStructuredDemandPublic({ structured: { process: { listing_kind: "talent_pool" } } }),
      ),
    ).toBe(true);
    expect(
      publicRequiresTalentPoolDisclosure(readStructuredDemandPublic({ structured: PUBLIC_VALID })),
    ).toBe(false);
    expect(publicRequiresTalentPoolDisclosure(null)).toBe(false);
  });

  it("the board component renders the disclosure chip + full disclosure text", () => {
    const component = read("components/app/opportunity-structured-detail.tsx");
    // Card-level chip gated by the shared predicate, with a stable testid.
    expect(component).toContain("publicRequiresTalentPoolDisclosure(structured)");
    expect(component).toContain('data-testid="opportunity-talent-pool"');
    expect(component).toContain('sd("listingKind.talent_pool")');
    // Detail-level full disclosure sentence (existing 11-locale catalog key).
    expect(component).toContain('data-testid="opportunity-talent-pool-disclosure"');
    expect(component).toContain('sd("talentPoolDisclosure")');
    // Honest degradation line when the projection is absent — one i18n key.
    expect(component).toContain('data-testid="opportunity-structured-not-provided"');
    expect(component).toContain('ts("notProvided")');
    // Visible amber honesty gaps in the pay section.
    expect(component).toContain('data-testid="opportunity-structured-gaps"');
    expect(component).toContain("derivePublicHonestyGaps");
  });

  it("the opportunities page mounts chips + sections and the loader parses the RPC field", () => {
    const page = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(page).toContain("<OpportunityStructuredChips");
    expect(page).toContain("<OpportunityStructuredSections");
    const loader = read("lib/opportunities/load-worker-opportunities.ts");
    expect(loader).toContain("readStructuredDemandPublic(row)");
  });
});

describe("i18n — opportunities.structured exists with full key parity in all 11 catalogs", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "da", "lv", "et", "pl", "no", "sv"] as const;

  function leafPaths(obj: unknown, path = ""): string[] {
    if (typeof obj === "string") return [path];
    if (obj && typeof obj === "object") {
      return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, path ? `${path}.${k}` : k));
    }
    return [];
  }

  const en = (
    JSON.parse(read("messages/en.json")) as {
      opportunities: { structured?: unknown };
    }
  ).opportunities.structured;
  const enKeys = leafPaths(en).sort();

  it("en defines the structured key set", () => {
    expect(enKeys.length).toBeGreaterThan(25);
    expect(enKeys).toContain("notProvided");
    expect(enKeys).toContain("gapsTitle");
  });

  for (const locale of LOCALES) {
    it(`${locale}: same structured key set, every value non-empty`, () => {
      const block = (
        JSON.parse(read(`messages/${locale}.json`)) as {
          opportunities: { structured?: unknown };
        }
      ).opportunities.structured;
      expect(leafPaths(block).sort()).toEqual(enKeys);
    });
  }
});
