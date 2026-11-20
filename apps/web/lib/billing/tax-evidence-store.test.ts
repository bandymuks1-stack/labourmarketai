/**
 * Stripe Tax evidence store — against a scripted fake of the service-role
 * client. Idempotency per Stripe object, event ordering, admin review state
 * kept on re-capture, verification updates on matching rows only, 42P01 →
 * needs-migration, and the superadmin gate on the review list / mark reviewed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { parseCheckoutSessionTax, type TaxEvidence } from "@/lib/billing/stripe-tax-core";
import {
  applyTaxIdVerification,
  listTaxEvidenceForAdmin,
  markTaxEvidenceReviewed,
  upsertTaxEvidence,
} from "./tax-evidence-store";

interface Call {
  table: string;
  op: "insert" | "update" | "select";
  args: unknown[];
  filters: Array<[string, unknown]>;
}
type Outcome = { data?: unknown; error?: { code?: string } | null };

function installFakeAdmin(handler: (call: Call, index: number) => Outcome): Call[] {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const make = (op: Call["op"], args: unknown[]) => {
        const call: Call = { table, op, args, filters: [] };
        calls.push(call);
        const idx = calls.length - 1;
        const finish = () => {
          const out = handler(call, idx);
          return { data: out.data ?? null, error: out.error ?? null };
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          eq(c: string, v: unknown) { call.filters.push([c, v]); return b; },
          not(c: string, _o: string, v: unknown) { call.filters.push([`not.${c}`, v]); return b; },
          select() { return b; },
          order() { return b; },
          limit() { return b; },
          maybeSingle: () => Promise.resolve(finish()),
          then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
            return Promise.resolve(finish()).then(ok, err);
          },
        };
        return b;
      };
      return {
        insert: (...a: unknown[]) => make("insert", a),
        update: (...a: unknown[]) => make("update", a),
        select: (...a: unknown[]) => make("select", a),
      };
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
  return calls;
}

const DE_REVERSE: TaxEvidence = parseCheckoutSessionTax({
  id: "cs_de",
  customer: "cus_de",
  metadata: { owner_id: "owner-1", organization_id: "org-1" },
  customer_details: { business_name: "Beispiel GmbH", address: { country: "DE" }, tax_exempt: "reverse", tax_ids: [{ type: "eu_vat", value: "DE123456789" }] },
  automatic_tax: { enabled: true, status: "complete" },
  amount_subtotal: 9900,
  amount_total: 9900,
  currency: "eur",
  total_details: { amount_tax: 0, breakdown: { taxes: [{ amount: 0, taxable_amount: 9900, taxability_reason: "reverse_charge", rate: { percentage: 0, country: "DE" } }] } },
})!;

const EVENT = { id: "evt_2", created: 1_800_000_000 };

beforeEach(() => {
  vi.mocked(isSuperadmin).mockResolvedValue(true);
});

describe("upsertTaxEvidence", () => {
  it("first capture INSERTS one row with the review decision (DE reverse charge, VAT id pending → flagged)", async () => {
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: null } : {}));
    const r = await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "pending", verifiedName: null }, event: EVENT });
    expect(r).toBe("ok");
    const insert = calls.find((c) => c.op === "insert")!;
    const row = insert.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      provider: "stripe",
      object_kind: "checkout_session",
      provider_object_id: "cs_de",
      organization_id: "org-1",
      owner_id: "owner-1",
      test_mode: true,
      billing_country: "DE",
      tax_id_value: "DE123456789",
      tax_id_verification_status: "pending",
      reverse_charge: true,
      amount_tax: 0,
      review_required: true,
      review_reason: "foreign_b2b_zero_tax_vat_id_pending",
      last_event_id: "evt_2",
    });
  });

  it("a replay of the same object UPDATES the same row (idempotent: never a second row)", async () => {
    const calls = installFakeAdmin((c) =>
      c.op === "select" ? { data: { id: "row-1", last_event_created_at: new Date(EVENT.created * 1000).toISOString(), reviewed_at: null } } : {},
    );
    const r = await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "pending", verifiedName: null }, event: EVENT });
    expect(r).toBe("ok");
    expect(calls.some((c) => c.op === "insert")).toBe(false);
    const up = calls.find((c) => c.op === "update")!;
    expect(up.filters).toContainEqual(["id", "row-1"]);
  });

  it("an OLDER event than the one that last wrote the row is skipped", async () => {
    const calls = installFakeAdmin((c) =>
      c.op === "select" ? { data: { id: "row-1", last_event_created_at: new Date((EVENT.created + 60) * 1000).toISOString() } } : {},
    );
    const r = await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "pending", verifiedName: null }, event: EVENT });
    expect(r).toBe("stale-event");
    expect(calls.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("a row an admin reviewed keeps its review columns on re-capture", async () => {
    const calls = installFakeAdmin((c) =>
      c.op === "select" ? { data: { id: "row-1", last_event_created_at: null, reviewed_at: "2026-10-23T10:00:00Z", review_required: false } } : {},
    );
    await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "pending", verifiedName: null }, event: EVENT });
    const patch = calls.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("review_required");
    expect(patch).not.toHaveProperty("review_reason");
  });

  it("an unreadable verification ('unknown') never replaces a status Stripe already gave", async () => {
    const calls = installFakeAdmin((c) =>
      c.op === "select" ? { data: { id: "row-1", last_event_created_at: null, reviewed_at: null, tax_id_verification_status: "verified" } } : {},
    );
    await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "unknown", verifiedName: null }, event: EVENT });
    const patch = calls.find((c) => c.op === "update")!.args[0] as Record<string, unknown>;
    expect(patch.tax_id_verification_status).toBe("verified");
    expect(patch.review_required).toBe(false);
  });

  it("a concurrent insert (23505) is applied as an update of the same object", async () => {
    const calls = installFakeAdmin((c) => {
      if (c.op === "select") return { data: null };
      if (c.op === "insert") return { error: { code: "23505" } };
      return {};
    });
    const r = await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: "pending", verifiedName: null }, event: EVENT });
    expect(r).toBe("ok");
    expect(calls.find((c) => c.op === "update")!.filters).toContainEqual(["provider_object_id", "cs_de"]);
  });

  it("table not applied (42P01) → needs-migration; other failures → error", async () => {
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: null, verifiedName: null }, event: EVENT })).toBe("needs-migration");
    installFakeAdmin(() => ({ error: { code: "XX000" } }));
    expect(await upsertTaxEvidence({ evidence: DE_REVERSE, testMode: true, verification: { status: null, verifiedName: null }, event: EVENT })).toBe("error");
  });
});

describe("applyTaxIdVerification", () => {
  const flagged = {
    id: "row-1",
    automatic_tax_requested: true,
    automatic_tax_status: "complete",
    billing_country: "DE",
    amount_subtotal: 9900,
    amount_tax: 0,
    taxes: [{ amount: 0 }],
    tax_id_value: "DE 123 456 789",
    tax_id_verification_status: "pending",
    review_required: true,
    review_reason: "foreign_b2b_zero_tax_vat_id_pending",
    reviewed_at: null,
    tax_id_verification_event_at: null,
  };

  it("verified clears the flag on the matching row of that customer only", async () => {
    const other = { ...flagged, id: "row-2", tax_id_value: "FR999" };
    const calls = installFakeAdmin((c) => (c.op === "select" ? { data: [flagged, other] } : {}));
    const r = await applyTaxIdVerification({ providerCustomerId: "cus_de", taxIdValue: "DE123456789", status: "verified", verifiedName: "Beispiel GmbH", event: EVENT });
    expect(r).toBe("ok");
    expect(calls[0].filters).toContainEqual(["provider_customer_id", "cus_de"]);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toContainEqual(["id", "row-1"]);
    expect(updates[0].args[0]).toMatchObject({ tax_id_verification_status: "verified", review_required: false, review_reason: null });
  });

  it("no evidence table yet → needs-migration (the route treats it as nothing to do)", async () => {
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await applyTaxIdVerification({ providerCustomerId: "cus", taxIdValue: "DE1", status: "verified", verifiedName: null, event: EVENT })).toBe("needs-migration");
  });
});

describe("superadmin review list and mark reviewed", () => {
  it("non-admins read nothing and cannot mark", async () => {
    vi.mocked(isSuperadmin).mockResolvedValue(false);
    const calls = installFakeAdmin(() => ({ data: [] }));
    expect(await listTaxEvidenceForAdmin()).toEqual({ status: "not_admin" });
    expect(await markTaxEvidenceReviewed({ id: "row-1", reviewerProfileId: "admin-1" })).toBe("not_admin");
    expect(calls).toEqual([]);
  });

  it("the list asks only for flagged rows", async () => {
    const calls = installFakeAdmin(() => ({ data: [] }));
    expect(await listTaxEvidenceForAdmin()).toEqual({ status: "ok", rows: [] });
    expect(calls[0].filters).toContainEqual(["review_required", true]);
  });

  it("mark reviewed records who/when and touches no amount", async () => {
    const calls = installFakeAdmin(() => ({ data: [{ id: "row-1" }] }));
    expect(await markTaxEvidenceReviewed({ id: "row-1", reviewerProfileId: "admin-1" })).toBe("ok");
    const patch = calls[0].args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ review_required: false, reviewed_by: "admin-1" });
    expect(Object.keys(patch).some((k) => k.startsWith("amount_") || k === "taxes" || k === "review_reason")).toBe(false);
  });
});
