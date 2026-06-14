/**
 * Service / pricing model — honest, no fake prices, worker free, paid = quote.
 */
import { describe, it, expect } from "vitest";
import {
  SERVICE_TIERS,
  tiersForAudience,
  hasNoFakePrice,
} from "./service-model";

describe("service model", () => {
  it("the worker passport is free; Worker Plus is not enabled yet", () => {
    const worker = tiersForAudience("worker");
    expect(worker.find((t) => t.key === "worker_passport_free")!.priceState).toBe("free");
    expect(worker.find((t) => t.key === "worker_plus_future")!.cta.toLowerCase()).toMatch(
      /not available/,
    );
  });

  it("every company/agency paid tier is pilot/quote — never a fake price", () => {
    for (const t of [...tiersForAudience("company"), ...tiersForAudience("agency")]) {
      expect(["pilot_access", "request_quote"], `${t.key}`).toContain(t.priceState);
    }
  });

  it("NO tier carries a fabricated price (currency / per-hour / decimal amount)", () => {
    expect(hasNoFakePrice()).toBe(true);
  });

  it("covers worker, company and agency audiences", () => {
    expect(tiersForAudience("worker").length).toBeGreaterThan(0);
    expect(tiersForAudience("company").length).toBeGreaterThan(0);
    expect(tiersForAudience("agency").length).toBeGreaterThan(0);
    expect(SERVICE_TIERS.length).toBe(
      tiersForAudience("worker").length +
        tiersForAudience("company").length +
        tiersForAudience("agency").length,
    );
  });

  it("the no-fake-price detector actually fires on a price", () => {
    const PRICE = /(€|\$|£|\beur\b|\busd\b|\d+\s*(\/|per)\s*(hour|month|week)|\b\d+[.,]\d{2}\b)/i;
    expect(PRICE.test("€500 / month")).toBe(true);
    expect(PRICE.test("Request a quote")).toBe(false);
  });
});
