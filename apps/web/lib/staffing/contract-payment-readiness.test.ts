/**
 * Contract / payment readiness — deterministic, payments never live.
 */
import { describe, it, expect } from "vitest";
import { computeContractPaymentReadiness } from "./contract-payment-readiness";

const ready = {
  fitBlockers: [] as string[],
  missingDocuments: [] as string[],
  companyReadinessBlockers: [] as string[],
  adminReviewDone: true,
  billingState: "disabled" as const,
};

describe("computeContractPaymentReadiness", () => {
  it("payment is ALWAYS blocked and paymentsLive is false — even when everything else is ready", () => {
    const r = computeContractPaymentReadiness(ready);
    expect(r.paymentsLive).toBe(false);
    const payment = r.items.find((i) => i.key === "payment")!;
    expect(payment.status).toBe("blocked");
    expect(r.nextStep).toBe("ready_for_manual_contract");
    expect(r.summary.toLowerCase()).toMatch(/not live/);
  });

  it("payment stays blocked in test mode (no live)", () => {
    const r = computeContractPaymentReadiness({ ...ready, billingState: "stripe_test" });
    expect(r.paymentsLive).toBe(false);
    expect(r.items.find((i) => i.key === "payment")!.detail.toLowerCase()).toMatch(/test mode/);
  });

  it("fit blockers take precedence as the next step", () => {
    const r = computeContractPaymentReadiness({ ...ready, fitBlockers: ["accommodation mismatch"] });
    expect(r.nextStep).toBe("resolve_fit_blockers");
    expect(r.items.find((i) => i.key === "fit")!.status).toBe("blocked");
  });

  it("missing documents block the manual-contract step", () => {
    const r = computeContractPaymentReadiness({ ...ready, missingDocuments: ["A1 certificate"] });
    expect(r.nextStep).toBe("complete_documents");
  });

  it("admin review pending → admin_review_needed", () => {
    const r = computeContractPaymentReadiness({ ...ready, adminReviewDone: false });
    expect(r.nextStep).toBe("admin_review_needed");
  });
});
