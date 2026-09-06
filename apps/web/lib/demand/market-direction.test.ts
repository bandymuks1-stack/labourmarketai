import { describe, expect, it } from "vitest";

import {
  DEMAND_KIND_OR_FILTER,
  isDemandKind,
  isSupplyKind,
  marketDirection,
} from "@/lib/demand/market-direction";

/**
 * The direction rule is what keeps the two halves of the market apart, so the
 * cases that matter are the ones a surface got wrong on production.
 */
describe("marketDirection", () => {
  it("an agency offer is SUPPLY — the sentence that broke the worker board", () => {
    // "Turime 20 suvirintojų ir ieškome jiems darbo Nyderlanduose."
    expect(marketDirection("agency_offer")).toBe("supply");
    expect(isSupplyKind("agency_offer")).toBe(true);
    expect(isDemandKind("agency_offer")).toBe(false);
  });

  it("a company request is DEMAND", () => {
    // "Reikia 8 elektrikų nuo spalio."
    expect(marketDirection("company_request")).toBe("demand");
    expect(isDemandKind("company_request")).toBe(true);
    expect(isSupplyKind("company_request")).toBe(false);
  });

  it("the buyer-spine kinds are DEMAND", () => {
    expect(marketDirection("buyer_request")).toBe("demand");
    expect(marketDirection("customer_request")).toBe("demand");
  });

  it("a NULL kind is DEMAND — pre-0028 buyer rows are real demand", () => {
    // Not defensive: 1 such row is live on production. Treating it as unknown
    // would empty the buyer spine from every demand surface.
    expect(marketDirection(null)).toBe("demand");
    expect(marketDirection(undefined)).toBe("demand");
    expect(isDemandKind(null)).toBe(true);
  });

  it("blank text is treated as an absent kind, not as a category", () => {
    expect(marketDirection("")).toBe("demand");
    expect(marketDirection("   ")).toBe("demand");
  });

  it("surrounding whitespace does not change the direction", () => {
    expect(marketDirection("  agency_offer  ")).toBe("supply");
  });

  it("an UNKNOWN kind is neither — a future kind is invisible by default", () => {
    // The whole point of the closed allow-lists: a kind added tomorrow must
    // not silently appear on a worker board or in an employer's needs.
    expect(marketDirection("worker_offer")).toBe("other");
    expect(marketDirection("institution_request")).toBe("other");
    expect(isDemandKind("worker_offer")).toBe(false);
    expect(isSupplyKind("worker_offer")).toBe(false);
  });

  it("the direction sets do not overlap", () => {
    for (const kind of [
      "company_request",
      "buyer_request",
      "customer_request",
      "agency_offer",
      "worker_offer",
      null,
    ]) {
      expect(isDemandKind(kind) && isSupplyKind(kind)).toBe(false);
    }
  });
});

describe("DEMAND_KIND_OR_FILTER", () => {
  it("matches every demand kind and the absent kind", () => {
    expect(DEMAND_KIND_OR_FILTER).toContain("kind.is.null");
    for (const k of ["company_request", "buyer_request", "customer_request"]) {
      expect(DEMAND_KIND_OR_FILTER).toContain("kind.eq." + k);
    }
  });

  it("names no supply kind — the filter and the classifier cannot disagree", () => {
    expect(DEMAND_KIND_OR_FILTER).not.toContain("agency_offer");
    for (const clause of DEMAND_KIND_OR_FILTER.split(",")) {
      const kind = clause.replace("kind.eq.", "");
      if (clause === "kind.is.null") continue;
      expect(marketDirection(kind)).toBe("demand");
    }
  });
});
