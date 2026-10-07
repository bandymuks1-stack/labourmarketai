import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { createMarketplaceListingAction } from "@/lib/marketplace/listings";
import { setServiceOfferingStatus } from "@/lib/services/service-offerings";
import { companyBecameHiringReady } from "@/lib/company/company-readiness";
import {
  invoiceBillingReason,
  invoiceHadPayment,
  shouldEmitBillingFunnel,
} from "@/lib/billing/billing-funnel";

/**
 * Call-site contracts for the funnel-emitters v1 events: fire ONCE, only
 * AFTER the write succeeded, never on failure, never with PII / ids / text.
 */
const asMock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const emit = asMock(emitServerFunnelEvent);

const ALLOWED_KEYS = new Set(["surface", "entity_type", "result_kind", "success"]);
function assertBounded(metadata: Record<string, unknown>) {
  for (const [k, v] of Object.entries(metadata)) {
    expect(ALLOWED_KEYS.has(k)).toBe(true);
    expect(["string", "boolean"]).toContain(typeof v);
    // no id-shaped, e-mail-shaped or long free-text values
    expect(String(v)).not.toMatch(/@|[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(String(v).length).toBeLessThanOrEqual(40);
  }
}

describe("offer_created - marketplace listing", () => {
  const base = {
    category: "tools",
    title: "Hammer drill for rent",
    description: "Works well, private text that must never reach telemetry",
  };
  const mk = (rpc: ReturnType<typeof vi.fn>) =>
    asMock(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      rpc,
    });
  beforeEach(() => vi.clearAllMocks());

  it("fires exactly once after the RPC succeeded, for an offering kind", async () => {
    mk(vi.fn().mockResolvedValue({ data: "listing-1", error: null }));
    const r = await createMarketplaceListingAction({ ...base, listingKind: "rental" } as never);
    expect(r.kind).toBe("ok");
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, opts] = emit.mock.calls[0];
    expect(event).toBe(FUNNEL_EVENTS.offerCreated);
    assertBounded(opts.metadata);
    expect(JSON.stringify(opts)).not.toContain("private text");
    expect(JSON.stringify(opts)).not.toContain("listing-1");
  });

  it("never fires when the RPC fails", async () => {
    mk(vi.fn().mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } }));
    const r = await createMarketplaceListingAction({ ...base, listingKind: "rental" } as never);
    expect(r.kind).toBe("error");
    expect(emit).not.toHaveBeenCalled();
  });

  it("never fires for a `wanted` listing (a need is not an offer)", async () => {
    mk(vi.fn().mockResolvedValue({ data: "listing-2", error: null }));
    const r = await createMarketplaceListingAction({ ...base, listingKind: "wanted" } as never);
    expect(r.kind).toBe("ok");
    expect(emit).not.toHaveBeenCalled();
  });

  it("never fires on invalid input", async () => {
    mk(vi.fn());
    const r = await createMarketplaceListingAction({ ...base, title: "x", listingKind: "rental" } as never);
    expect(r.kind).toBe("invalid");
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("offer_created - service offering first publication", () => {
  beforeEach(() => vi.clearAllMocks());
  function client(prior: unknown, updateError: unknown) {
    const select = {
      eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prior }) }) }),
    };
    const update = { eq: () => ({ eq: async () => ({ error: updateError }) }) };
    asMock(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      from: () => ({ select: () => select, update: () => update }),
    });
  }

  it("fires once on draft -> active after the update succeeded", async () => {
    client({ status: "draft" }, null);
    const r = await setServiceOfferingStatus("o1", "active");
    expect(r.kind).toBe("ok");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toBe(FUNNEL_EVENTS.offerCreated);
    assertBounded(emit.mock.calls[0][1].metadata);
  });

  it("does not fire on paused -> active, active -> paused, or an unknown prior status", async () => {
    client({ status: "paused" }, null);
    await setServiceOfferingStatus("o1", "active");
    client(null, null);
    await setServiceOfferingStatus("o1", "active");
    client({ status: "active" }, null);
    await setServiceOfferingStatus("o1", "paused");
    expect(emit).not.toHaveBeenCalled();
  });

  it("does not fire when the update fails", async () => {
    client({ status: "draft" }, { code: "XX000", message: "boom" });
    const r = await setServiceOfferingStatus("o1", "active");
    expect(r.kind).toBe("error");
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("organization_hiring_ready - transition-only", () => {
  const ready = {
    legalName: "Acme UAB",
    country: "LT",
    registrationCode: "123456789",
    contactEmail: "billing@acme.example",
    companyType: "construction",
    verificationStatus: null,
  };
  it("true when a missing/incomplete company becomes hiring_ready", () => {
    expect(companyBecameHiringReady(null, ready)).toBe(true);
    expect(companyBecameHiringReady({ ...ready, registrationCode: null }, ready)).toBe(true);
  });
  it("false when it was already ready (idempotent re-save)", () => {
    expect(companyBecameHiringReady(ready, ready)).toBe(false);
  });
  it("false when the result is still not ready (basic: activity unspecified)", () => {
    expect(companyBecameHiringReady(null, { ...ready, companyType: "other" })).toBe(false);
    expect(companyBecameHiringReady(null, { ...ready, legalName: null })).toBe(false);
  });
  it("false when the before-state is UNKNOWN (failed pre-read)", () => {
    expect(companyBecameHiringReady(undefined, ready)).toBe(false);
  });
});

describe("billing funnel decisions", () => {
  it("counts a payment only for a strictly positive amount_paid", () => {
    expect(invoiceHadPayment({ amount_paid: 1900 })).toBe(true);
    expect(invoiceHadPayment({ amount_paid: 0 })).toBe(false); // trial invoice
    expect(invoiceHadPayment({ amount_paid: -5 })).toBe(false);
    expect(invoiceHadPayment({ amount_paid: "1900" })).toBe(false);
    expect(invoiceHadPayment({})).toBe(false);
    expect(invoiceHadPayment(null)).toBe(false);
  });
  it("collapses billing_reason to a bounded word", () => {
    expect(invoiceBillingReason({ billing_reason: "subscription_create" })).toBe("subscription_create");
    expect(invoiceBillingReason({ billing_reason: "a@b.c" })).toBe("other");
    expect(invoiceBillingReason(undefined)).toBe("other");
  });
  it("emits only for a persisted ok in LIVE mode - never stale, error or test mode", () => {
    expect(shouldEmitBillingFunnel("ok", false)).toBe(true);
    expect(shouldEmitBillingFunnel("ok", true)).toBe(false);
    for (const r of ["stale-event", "error", "needs-migration", "conflict-live-subscription"]) {
      expect(shouldEmitBillingFunnel(r, false)).toBe(false);
    }
  });
});
