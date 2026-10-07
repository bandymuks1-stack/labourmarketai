import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-order contracts for the emitters that are too heavy to execute in a
 * unit test (Stripe webhook route, company setup RPC chain). A declared event
 * is not an emitted one, and an emitted one must come AFTER the persisted
 * success - never before, never on a failure path.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("billing webhook emits only after the verified, persisted handler", () => {
  const src = read("app/api/billing/webhook/route.ts");
  it("emits subscription_started / subscription_invoice_paid", () => {
    expect(src).toMatch(/FUNNEL_EVENTS\.subscriptionStarted/);
    expect(src).toMatch(/FUNNEL_EVENTS\.subscriptionInvoicePaid/);
  });
  it("both emissions sit after signature verification and the persisted-ok gate", () => {
    const verify = src.indexOf("constructWebhookEvent");
    const mode = src.indexOf("eventModeMatches(");
    const gate = src.indexOf("shouldEmitBillingFunnel(result, event.testMode)");
    const e1 = src.indexOf("FUNNEL_EVENTS.subscriptionStarted");
    const e2 = src.indexOf("FUNNEL_EVENTS.subscriptionInvoicePaid");
    const processed = src.indexOf("await markWebhookProcessed(event.id);\n    return NextResponse.json({ ok: true, received: true, processed: true, result })");
    expect(verify).toBeGreaterThan(-1);
    expect(mode).toBeGreaterThan(verify);
    expect(gate).toBeGreaterThan(mode);
    expect(e1).toBeGreaterThan(gate);
    expect(e2).toBeGreaterThan(gate);
    expect(processed).toBeGreaterThan(e2);
  });
  it("counts invoice.paid only (never invoice.payment_succeeded) and requires money moved", () => {
    expect(src).toMatch(/event\.type === "invoice\.paid" && invoiceHadPayment\(event\.object\)/);
  });
  it("does not touch billing configuration or arm charging", () => {
    expect(src).not.toMatch(/config-core|lmc-flags|setBillingState|stripe_live"\s*=/);
  });
});

describe("company setup emits organization_hiring_ready only on the readiness transition", () => {
  const src = read("lib/company/company-setup.ts");
  it("is gated by companyBecameHiringReady and sits after the RPC error handling", () => {
    const err = src.lastIndexOf("save_failed");
    const gate = src.indexOf("companyBecameHiringReady(before, after)");
    const emitAt = src.indexOf("FUNNEL_EVENTS.organizationHiringReady");
    expect(err).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(err);
    expect(emitAt).toBeGreaterThan(gate);
  });
  it("emits nothing when the before-state read failed", () => {
    expect(src).toMatch(/if \(existing\.kind === "ok"\) \{\s*const before =/);
  });
});

describe("worker 'useful profile' reuses the existing profile_matchable emitter", () => {
  it("is emitted by the opportunities board only when the board gate read true", () => {
    const src = read("app/[locale]/dashboard/opportunities/page.tsx");
    expect(src).toMatch(
      /readiness\.hasWorkType && result\.readiness\.hasSkills[\s\S]{0,200}FUNNEL_EVENTS\.profileMatchable/,
    );
  });
});
