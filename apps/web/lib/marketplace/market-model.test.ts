import { describe, expect, it } from "vitest";

import {
  ALL_SUBJECTS,
  DEMAND_DOMAIN_NOT_INDEXED,
  PROJECTS_DOMAIN_NOT_INDEXED,
  WORKERS_DOMAIN_NOT_INDEXED,
  contactActionFor,
  destinationPathFor,
  LISTING_DOMAINS,
  SUBJECTS_BY_DOMAIN,
  SUBJECT_FORMAT,
  allowedKindsForDomain,
  deriveDirection,
  domainOfSubject,
  isExpired,
  isKindAllowedForSubject,
  isRegisteredSubject,
  sourceTableForDomain,
  validateAmounts,
  type MarketDirection,
  type MarketIndexDomain,
} from "./market-model";
import { assessPublish } from "./publish-policy";

/**
 * The 13 owner use cases of the universal marketplace, each mapped to
 * (actor kind, direction, domain, where it is discoverable). The mapping is
 * computed through the model — not restated — so a drift in the registry or the
 * direction rule fails here.
 */
type Fixture = {
  id: string;
  useCase: string;
  actor: "person" | "company";
  direction: MarketDirection;
  /** The marketplace listing it is published as (null = not a listing). */
  listing: { kind: string; subject: string } | null;
  domain: MarketIndexDomain | null;
  /** Source table in the index, or the honest "not in the index" sentence. */
  discoverableVia: string;
};

const USE_CASES: readonly Fixture[] = [
  { id: "A", useCase: "worker offers work", actor: "person", direction: "offer", listing: null, domain: null, discoverableVia: WORKERS_DOMAIN_NOT_INDEXED },
  { id: "B", useCase: "employer needs worker", actor: "company", direction: "need", listing: null, domain: null, discoverableVia: DEMAND_DOMAIN_NOT_INDEXED },
  { id: "C", useCase: "person offers service", actor: "person", direction: "offer", listing: null, domain: "service", discoverableVia: "service_offerings" },
  { id: "D", useCase: "company offers service", actor: "company", direction: "offer", listing: null, domain: "service", discoverableVia: "service_offerings" },
  { id: "E", useCase: "person needs service", actor: "person", direction: "need", listing: { kind: "wanted", subject: "service_general" }, domain: "service_need", discoverableVia: "marketplace_listings" },
  { id: "F", useCase: "company needs service", actor: "company", direction: "need", listing: { kind: "wanted", subject: "service_trade" }, domain: "service_need", discoverableVia: "marketplace_listings" },
  { id: "G", useCase: "person sells tomatoes", actor: "person", direction: "offer", listing: { kind: "sale", subject: "goods_food_homegrown" }, domain: "goods", discoverableVia: "marketplace_listings" },
  { id: "H", useCase: "person sells handmade item / art", actor: "person", direction: "offer", listing: { kind: "sale", subject: "goods_handmade" }, domain: "goods", discoverableVia: "marketplace_listings" },
  { id: "I", useCase: "person wants to buy / find goods", actor: "person", direction: "need", listing: { kind: "wanted", subject: "goods_other" }, domain: "goods", discoverableVia: "marketplace_listings" },
  { id: "J", useCase: "company sells goods", actor: "company", direction: "offer", listing: { kind: "sale", subject: "goods_other" }, domain: "goods", discoverableVia: "marketplace_listings" },
  { id: "K", useCase: "company needs goods", actor: "company", direction: "need", listing: { kind: "wanted", subject: "goods_other" }, domain: "goods", discoverableVia: "marketplace_listings" },
  { id: "L", useCase: "contractor offers project capability", actor: "company", direction: "offer", listing: { kind: "sale", subject: "project_work" }, domain: "project_work", discoverableVia: "marketplace_listings" },
  { id: "M", useCase: "client publishes project / contract need", actor: "company", direction: "need", listing: null, domain: null, discoverableVia: PROJECTS_DOMAIN_NOT_INDEXED },
];

describe("13 use cases map to (actor, direction, domain, discovery)", () => {
  it("covers exactly 13 cases A..M", () => {
    expect(USE_CASES.map((u) => u.id).join("")).toBe("ABCDEFGHIJKLM");
  });

  for (const u of USE_CASES) {
    it(`${u.id}. ${u.useCase}`, () => {
      if (u.listing) {
        expect(deriveDirection(u.listing.kind)).toBe(u.direction);
        expect(domainOfSubject(u.listing.subject)).toBe(u.domain);
        expect(isKindAllowedForSubject(u.listing.kind, u.listing.subject)).toBe(true);
        expect(sourceTableForDomain(u.domain as MarketIndexDomain)).toBe(u.discoverableVia);
        // nothing here may be turned away by the policy except the food check
        const v = assessPublish({
          subject: u.listing.subject,
          listingKind: u.listing.kind,
          title: "x item",
        });
        expect(v.kind).toBe(
          u.id === "G" ? "LEGAL_CHECK_REQUIRED" : "CAN_ROUTE",
        );
      } else if (u.domain === "service") {
        // services ride the existing service_offerings table, direction offer
        expect(sourceTableForDomain("service")).toBe("service_offerings");
        expect(u.discoverableVia).toBe("service_offerings");
        expect(u.direction).toBe("offer");
      } else {
        // A / B / M stay in their existing domains (workers / demand / projects)
        expect([
          WORKERS_DOMAIN_NOT_INDEXED,
          DEMAND_DOMAIN_NOT_INDEXED,
          PROJECTS_DOMAIN_NOT_INDEXED,
        ]).toContain(u.discoverableVia);
        expect(u.domain).toBeNull();
      }
    });
  }

  it("A, B, M are NOT in the index, each in its own domain", () => {
    const via = Object.fromEntries(USE_CASES.map((u) => [u.id, u.discoverableVia]));
    expect(via.A).toBe(WORKERS_DOMAIN_NOT_INDEXED);
    expect(via.B).toBe(DEMAND_DOMAIN_NOT_INDEXED);
    expect(via.M).toBe(PROJECTS_DOMAIN_NOT_INDEXED);
  });

  it("E and F are discoverable as a WANTED listing with a service_need subject", () => {
    for (const id of ["E", "F"]) {
      const u = USE_CASES.find((x) => x.id === id)!;
      expect(u.listing?.kind).toBe("wanted");
      expect(domainOfSubject(u.listing!.subject)).toBe("service_need");
    }
  });
});

describe("direction rule (mirrors lib/demand/market-direction.ts)", () => {
  it("wanted -> need, sale|rental -> offer", () => {
    expect(deriveDirection("wanted")).toBe("need");
    expect(deriveDirection("sale")).toBe("offer");
    expect(deriveDirection("rental")).toBe("offer");
  });
  it("unknown / empty is `other` — never guessed into either side", () => {
    for (const k of ["swap", "", "WANTED", " wanted", null, undefined]) {
      expect(deriveDirection(k as string | null | undefined)).toBe("other");
    }
  });
});

describe("registry mirror", () => {
  it("every subject is unique across domains and matches the format rule", () => {
    expect(new Set(ALL_SUBJECTS).size).toBe(ALL_SUBJECTS.length);
    for (const s of ALL_SUBJECTS) expect(s).toMatch(SUBJECT_FORMAT);
  });
  it("the 7 original work categories stay in work_resource", () => {
    expect(SUBJECTS_BY_DOMAIN.work_resource).toEqual([
      "accommodation", "premises", "vehicle", "tools", "equipment", "machinery", "safety_equipment",
    ]);
  });
  it("unknown subject has no domain and is not registered", () => {
    expect(domainOfSubject("nonsense")).toBeNull();
    expect(isRegisteredSubject("nonsense")).toBe(false);
    expect(isRegisteredSubject("goods_other")).toBe(true);
  });
  it("has the five listing domains", () => {
    expect([...LISTING_DOMAINS]).toEqual([
      "work_resource", "goods", "service_need", "personal", "project_work",
    ]);
  });
  it("a project need is not a listing; project capability is an offer", () => {
    expect(allowedKindsForDomain("project_work")).toEqual(["sale"]);
    expect(isKindAllowedForSubject("wanted", "project_work")).toBe(false);
    expect(isKindAllowedForSubject("sale", "project_work")).toBe(true);
  });
  it("destination + contact action are derived from the source (existing routes only)", () => {
    expect(destinationPathFor("marketplace_listings", "abc")).toBe("/dashboard/listings?focus=abc");
    expect(destinationPathFor("service_offerings", "abc")).toBe("/dashboard/services");
    expect(contactActionFor("marketplace_listings")).toBe("enquire");
    expect(contactActionFor("service_offerings")).toBe("request_service");
  });
  it("a service need can only be wanted", () => {
    expect(allowedKindsForDomain("service_need")).toEqual(["wanted"]);
    expect(isKindAllowedForSubject("sale", "service_trade")).toBe(false);
    expect(isKindAllowedForSubject("sale", "goods_handmade")).toBe(true);
  });
});

describe("descriptive amounts (no payment)", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("a price needs a currency; quantity > 0; expiry in the future", () => {
    expect(validateAmounts({ priceAmount: 2, currency: "EUR" }, now).ok).toBe(true);
    expect(validateAmounts({ priceAmount: 2 }, now)).toEqual({ ok: false, field: "price" });
    expect(validateAmounts({ priceAmount: -1, currency: "EUR" }, now)).toEqual({ ok: false, field: "price" });
    expect(validateAmounts({ priceAmount: 1, currency: "EURO" }, now)).toEqual({ ok: false, field: "price" });
    expect(validateAmounts({ quantity: 0 }, now)).toEqual({ ok: false, field: "quantity" });
    expect(validateAmounts({ expiresAt: "2026-10-01T00:00:00Z" }, now)).toEqual({ ok: false, field: "expiry" });
    expect(validateAmounts({ expiresAt: "2026-10-09T00:00:00Z" }, now).ok).toBe(true);
    expect(validateAmounts({}, now).ok).toBe(true);
  });
  it("isExpired: null never expires", () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired("2000-01-01T00:00:00Z")).toBe(true);
  });
});

describe("publish policy (reuses the eligibility verdict union; no age/identity input)", () => {
  it("food sale -> LEGAL_CHECK_REQUIRED naming food_sale_rules (rule NOT weakened)", () => {
    const v = assessPublish({ subject: "goods_food_homegrown", listingKind: "sale", title: "Tomatoes" });
    expect(v).toMatchObject({ kind: "LEGAL_CHECK_REQUIRED", ruleKey: "food_sale_rules", legalCheckKey: "food_sale_rules" });
  });
  it("food hidden behind a generic goods subject is still caught", () => {
    const v = assessPublish({ subject: "goods_other", listingKind: "sale", title: "Fresh honey and eggs" });
    expect(v.kind).toBe("LEGAL_CHECK_REQUIRED");
  });
  it("restricted goods are refused outright (no alternative)", () => {
    const v = assessPublish({ subject: "goods_other", listingKind: "sale", title: "Hunting rifle ammunition" });
    expect(v).toMatchObject({ kind: "CHANNEL_RESTRICTED", reasonKey: "restricted_category" });
  });
  it("a work_resource 'nail gun' keeps its pre-existing behaviour (not refused)", () => {
    expect(assessPublish({ subject: "tools", listingKind: "rental", title: "Nail gun" }).kind).toBe("CAN_ROUTE");
  });
  it("wanting to buy is not a food sale", () => {
    expect(assessPublish({ subject: "goods_food_homegrown", listingKind: "wanted", title: "Tomatoes" }).kind).toBe("CAN_ROUTE");
  });
  it("unregistered subject / wrong direction are CHANNEL_RESTRICTED", () => {
    expect(assessPublish({ subject: "nonsense", listingKind: "sale" })).toMatchObject({ kind: "CHANNEL_RESTRICTED", ruleKey: "unregistered_subject" });
    expect(assessPublish({ subject: "service_trade", listingKind: "sale" })).toMatchObject({ kind: "CHANNEL_RESTRICTED", ruleKey: "direction_not_allowed" });
  });
});
