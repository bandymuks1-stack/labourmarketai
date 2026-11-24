import { describe, expect, it } from "vitest";

import { deriveNeedSkills } from "@/lib/market/need-skills";
import {
  matchWorkerToNeed,
  compareMatches,
  type MatchNeed,
  type MatchSubject,
  type MatchResultV1,
} from "@/lib/market/match-v1";

/**
 * REAL MARKET SCENARIOS — demand → worker fixtures (Matching PR4, Task 5).
 *
 * Every scenario runs the FULL canonical pipeline: realistic company demand
 * text (the free text companies actually write, in the product's languages)
 * → offline recognition (need-skills derivation) → deterministic match →
 * shared ranking comparator. Workers are realistic canonical-slug subjects
 * with honest evidence tiers. NO ESCO URI appears anywhere — this is the
 * proof that matching works on canonical slugs alone (prod: esco_uri 0/152).
 *
 * These are TEST fixtures (never shipped as product data — §18).
 */

type W = MatchSubject & { name: string };

const worker = (
  name: string,
  professionSlug: string | null,
  skills: [slug: string, evidence: "manager_confirmed" | "work_journal" | "self_declared"][],
  extra: Partial<MatchSubject> = {},
): W => ({
  name,
  professionSlug,
  skills: skills.map(([uri, evidence]) => ({ uri, evidence })),
  country: "LT",
  availabilityStatus: "available",
  ...extra,
});

// ── The worker supply (canonical slugs, real evidence tiers) ───────────────
const warehousePicker = worker("warehouse-picker", "warehouse_worker", [
  ["order-picking", "work_journal"],
  ["barcode-scanning", "work_journal"],
  ["pallet-handling", "self_declared"],
  ["warehouse-operations", "manager_confirmed"],
]);
const cookWorker = worker("cook", "cook", [
  ["cooking", "work_journal"],
  ["kitchen-help", "self_declared"],
  ["waiting-tables", "self_declared"],
]);
const kitchenHelper = worker("kitchen-helper", "kitchen_helper", [
  ["kitchen-help", "work_journal"],
  ["dishwashing", "work_journal"],
  ["cleaning-services", "self_declared"],
]);
const programmer = worker("programmer", "software_developer", [
  ["programming", "manager_confirmed"],
  ["qa-testing", "work_journal"],
  ["it-support", "self_declared"],
]);
const cleanerWorker = worker("cleaner", "cleaner", [
  ["cleaning-services", "work_journal"],
  ["laundry", "self_declared"],
  ["window-cleaning", "work_journal"],
]);
const laundryWorker = worker("laundry-worker", "laundry_worker", [
  ["laundry", "work_journal"],
  ["cleaning-services", "work_journal"],
]);
const driverWorker = worker("driver", "driver", [
  ["driving", "manager_confirmed"],
  ["cargo-transport", "work_journal"],
  ["delivery-driving", "self_declared"],
]);
const mechanic = worker("mechanic", "auto_mechanic", [
  ["auto-repair", "work_journal"],
  ["handyman-work", "self_declared"],
  ["hand-tools", "self_declared"],
]);
const cashierWorker = worker("cashier", "sales_assistant", [
  ["cashier", "work_journal"],
  ["customer-service", "self_declared"],
]);
const officeAdmin = worker("office-admin", "office_administrator", [
  ["data-entry", "work_journal"],
  ["office-software", "self_declared"],
  ["document-handling", "work_journal"],
  ["reception", "self_declared"],
]);
const masonWorker = worker("mason", "mason", [
  ["bricklaying", "manager_confirmed"],
  ["blockwork", "work_journal"],
  ["mortar-prep", "self_declared"],
]);
const constructionOnly = worker("construction-labourer", "builder", [
  ["scaffolding", "work_journal"],
  ["demolition", "self_declared"],
  ["general-labour", "work_journal"],
]);
const callCentreWorker = worker("call-centre-agent", "call_centre_agent", [
  ["call-centre", "work_journal"],
  ["customer-service", "work_journal"],
  ["reception", "self_declared"],
]);

/** Demand text → MatchNeed via the canonical derivation (the REAL path). */
function needFromText(text: string, extra: Partial<MatchNeed> = {}): MatchNeed {
  const derived = deriveNeedSkills({ needSummary: text });
  return {
    skillIds: derived.skillSlugs,
    needSource: derived.source,
    professionSlug: derived.professionSlug,
    ...extra,
  };
}

/** Rank a supply against a need with the SHARED comparator. */
function rank(need: MatchNeed, supply: W[]): { name: string; match: MatchResultV1 }[] {
  return supply
    .map((w) => ({ name: w.name, match: matchWorkerToNeed(need, w) }))
    .sort((a, b) => compareMatches(a.match, b.match));
}

function names(ranked: { name: string }[]): string[] {
  return ranked.map((r) => r.name);
}

describe("scenario 1 — warehouse / order picking near a city (EN text)", () => {
  const need = needFromText(
    "We need warehouse workers for order picking, barcode scanning and pallet handling in Vilnius.",
    { country: "LT", city: "Vilnius" },
  );
  it("derives canonical requirements from the text offline", () => {
    expect(need.skillIds).toEqual(
      expect.arrayContaining(["order-picking", "barcode-scanning", "pallet-handling"]),
    );
    expect(need.needSource).toBe("recognized_from_text");
  });
  it("ranks the warehouse picker above the cook and the programmer", () => {
    const r = names(rank(need, [programmer, cookWorker, warehousePicker]));
    expect(r[0]).toBe("warehouse-picker");
  });
});

describe("scenario 2 — kitchen helper / dishwashing (LT text)", () => {
  const need = needFromText(
    "Restoranui reikalingas virtuvės pagalbininkas — indų plovimas ir pagalba virtuvėje.",
  );
  it("ranks kitchen evidence above the office worker", () => {
    const r = names(rank(need, [officeAdmin, kitchenHelper, cookWorker]));
    expect(r[0]).toBe("kitchen-helper");
    expect(r.indexOf("kitchen-helper")).toBeLessThan(r.indexOf("office-admin"));
    expect(r.indexOf("cook")).toBeLessThan(r.indexOf("office-admin"));
  });
});

describe("scenario 3 — cleaning / laundry (RU text)", () => {
  const need = needFromText(
    "Нужны работники: уборка офисов и стирка, глажение белья.",
  );
  it("ranks the cleaner and laundry worker above the driver", () => {
    const r = names(rank(need, [driverWorker, laundryWorker, cleanerWorker]));
    expect(r.indexOf("cleaner")).toBeLessThan(r.indexOf("driver"));
    expect(r.indexOf("laundry-worker")).toBeLessThan(r.indexOf("driver"));
  });
});

describe("scenario 4 — auto repair / maintenance (EN text)", () => {
  const need = needFromText(
    "Looking for someone who repaired cars at a garage, plus minor repairs and handyman work.",
  );
  it("ranks the mechanic above the cashier", () => {
    const r = names(rank(need, [cashierWorker, mechanic]));
    expect(r[0]).toBe("mechanic");
  });
});

describe("scenario 5 — office / data entry / Excel (EN text)", () => {
  const need = needFromText(
    "Office assistant needed: entered data, worked with Excel, document handling and reception.",
  );
  it("ranks the office administrator above the construction-only worker", () => {
    const r = names(rank(need, [constructionOnly, officeAdmin]));
    expect(r[0]).toBe("office-admin");
  });
});

describe("scenario 6 — construction masonry (DE text)", () => {
  const need = needFromText(
    "Wir suchen einen Maurer: Wände gemauert, Mörtel angemischt, Blockwork.",
  );
  it("derives masonry skills from German text via the same offline recognizer", () => {
    expect(need.skillIds).toEqual(expect.arrayContaining(["bricklaying"]));
  });
  it("ranks the mason above the generic warehouse worker", () => {
    const r = names(rank(need, [warehousePicker, masonWorker]));
    expect(r[0]).toBe("mason");
  });
});

describe("scenario 7 — customer service / call centre (EN text)", () => {
  const need = needFromText(
    "We need someone who answered calls in a call centre, customer service and reception work.",
  );
  it("ranks the call-centre agent above the mason", () => {
    const r = names(rank(need, [masonWorker, callCentreWorker]));
    expect(r[0]).toBe("call-centre-agent");
  });
});

describe("scenario 8 — radius: nearby worker outranks distant worker", () => {
  // Vilnius work site, 30 km radius. Same skills on both workers — only the
  // coordinates differ (synthetic but REAL inputs to the engine; nothing is
  // invented at runtime — workers without coordinates skip this path).
  const need: MatchNeed = {
    skillIds: ["order-picking", "warehouse-operations"],
    needSource: "human_structured",
    country: "LT",
    lat: 54.6872,
    lng: 25.2797,
    radiusKm: 30,
  };
  const near: W = { ...warehousePicker, name: "near-worker", lat: 54.71, lng: 25.3 };
  const far: W = { ...warehousePicker, name: "far-worker", lat: 55.7, lng: 21.14 }; // Klaipėda ~300km
  it("worker inside the radius ranks above the worker outside it", () => {
    const r = rank(need, [far, near]);
    expect(names(r)[0]).toBe("near-worker");
    expect(r[0].match.reasons.some((x) => x.code === "location_within_radius")).toBe(true);
    const farMatch = r.find((x) => x.name === "far-worker")!.match;
    expect(farMatch.gaps.some((x) => x.code === "location_outside_radius")).toBe(true);
  });
});

describe("scenario 9 — missing required skills are listed clearly", () => {
  const need: MatchNeed = {
    skillIds: ["order-picking", "forklift-operation", "stock-taking"],
    needSource: "human_structured",
  };
  it("names exactly the missing slugs", () => {
    const m = matchWorkerToNeed(need, warehousePicker);
    const missing = m.gaps.find((g) => g.code === "skills_missing");
    expect(missing).toBeTruthy();
    expect(missing!.code === "skills_missing" && [...missing!.uris].sort()).toEqual([
      "forklift-operation",
      "stock-taking",
    ]);
    expect(m.skillFit?.matchedUris).toEqual(["order-picking"]);
  });
});

describe("scenario 10 — unknown availability is honest, never an advantage", () => {
  const need: MatchNeed = {
    skillIds: ["cleaning-services", "window-cleaning"],
    needSource: "human_structured",
  };
  const availableCleaner: W = { ...cleanerWorker, name: "available-cleaner" };
  const unknownCleaner: W = {
    ...cleanerWorker,
    name: "unknown-cleaner",
    availabilityStatus: null,
    availableFrom: null,
  };
  it("explicit availability outranks unknown at equal skill fit", () => {
    const r = rank(need, [unknownCleaner, availableCleaner]);
    expect(names(r)[0]).toBe("available-cleaner");
  });
  it("unknown availability is explained as missing data, not assumed", () => {
    const m = matchWorkerToNeed(need, unknownCleaner);
    expect(m.availability).toBe("unknown");
    expect(m.missingData).toContain("availability_unknown");
    expect(m.reasons.some((x) => x.code === "available_now")).toBe(false);
  });
  it("a much stronger skill fit MAY outrank explicit availability — with the unknown explained", () => {
    const strongUnknown: W = {
      ...worker("strong-unknown", "cleaner", [
        ["cleaning-services", "manager_confirmed"],
        ["window-cleaning", "manager_confirmed"],
      ]),
      availabilityStatus: null,
    };
    const weakAvailable: W = worker("weak-available", "cleaner", [
      ["cleaning-services", "self_declared"],
    ]);
    const r = rank(need, [weakAvailable, strongUnknown]);
    expect(names(r)[0]).toBe("strong-unknown");
    expect(r[0].match.missingData).toContain("availability_unknown");
  });
});
