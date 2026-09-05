/**
 * Checkout operations store — against a scripted fake of the service-role
 * client (billing safety v1).
 *
 *   1. a fresh insert opens an operation whose key derives from its id;
 *   2. a 23505 on the one-open-per-scope index REUSES the winner (same key,
 *      same expires_at) while the winner is inside its window;
 *   3. an EXPIRED winner is closed and a fresh operation is inserted;
 *   4. 42P01 → needs-migration (the route falls back to the legacy key);
 *   5. an unreadable store → error (the route fails CLOSED);
 *   6. bookkeeping writes target the session id and are status-guarded.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  attachProviderSession,
  completeCheckoutOperationBySession,
  expireCheckoutOperationBySession,
  markCheckoutOperationFailed,
  openCheckoutOperation,
} from "./checkout-operations-store";

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
          is(c: string, v: unknown) { call.filters.push([c, v]); return b; },
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

const NOW = new Date("2026-09-05T10:00:00.000Z");
const BASE = {
  ownerId: "owner-1",
  organizationId: "org-1",
  scope: { type: "organization" as const, id: "org-1" },
  planKey: "company_pilot",
  priceId: "price_99",
  testMode: false,
  now: NOW,
};

beforeEach(() => vi.clearAllMocks());

describe("openCheckoutOperation", () => {
  it("fresh insert → opened; key derives from the row id; window = 45 min", async () => {
    const calls = installFakeAdmin(() => ({}));
    const r = await openCheckoutOperation(BASE);
    expect(r.kind).toBe("opened");
    if (r.kind !== "opened") return;
    const row = calls[0].args[0] as Record<string, unknown>;
    expect(calls[0].table).toBe("billing_checkout_operations");
    expect(row.status).toBe("open");
    expect(row.scope_key).toBe("organization:org-1");
    expect(row.provider_price_id).toBe("price_99");
    expect(row.test_mode).toBe(false);
    expect(row.idempotency_key).toBe(`co2_organization_org-1_company_pilot_${r.operation.id}`);
    expect(r.operation.idempotencyKey).toBe(row.idempotency_key);
    expect(r.operation.expiresAt).toBe("2026-09-05T10:45:00.000Z");
  });

  it("23505 → reuses the open winner inside its window (same key + same expiry)", async () => {
    const winner = {
      id: "win", scope_key: "organization:org-1", plan_key: "company_pilot",
      idempotency_key: "co2_organization_org-1_company_pilot_win",
      expires_at: "2026-09-05T10:40:00.000Z", provider_session_id: "cs_1", status: "open",
    };
    const calls = installFakeAdmin((c) => (c.op === "insert" ? { error: { code: "23505" } } : { data: winner }));
    const r = await openCheckoutOperation(BASE);
    expect(r).toEqual({
      kind: "reused",
      operation: {
        id: "win", scopeKey: "organization:org-1", planKey: "company_pilot",
        idempotencyKey: "co2_organization_org-1_company_pilot_win",
        expiresAt: "2026-09-05T10:40:00.000Z", providerSessionId: "cs_1",
      },
    });
    const sel = calls.find((c) => c.op === "select")!;
    expect(sel.filters).toEqual(expect.arrayContaining([["scope_key", "organization:org-1"], ["plan_key", "company_pilot"], ["status", "open"]]));
    // No second insert happened — the loser did not mint a second identity.
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1);
  });

  it("23505 on an EXPIRED winner → closes it (status-guarded) and inserts a fresh operation", async () => {
    const stale = {
      id: "old", scope_key: "organization:org-1", plan_key: "company_pilot",
      idempotency_key: "co2_organization_org-1_company_pilot_old",
      expires_at: "2026-09-05T09:00:00.000Z", provider_session_id: null, status: "open",
    };
    let inserts = 0;
    const calls = installFakeAdmin((c) => {
      if (c.op === "insert") { inserts += 1; return inserts === 1 ? { error: { code: "23505" } } : {}; }
      if (c.op === "select") return { data: stale };
      return {};
    });
    const r = await openCheckoutOperation(BASE);
    expect(r.kind).toBe("opened");
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.args[0]).toEqual(expect.objectContaining({ status: "expired" }));
    expect(upd.filters).toEqual(expect.arrayContaining([["id", "old"], ["status", "open"]]));
    expect(inserts).toBe(2);
  });

  it("42P01 → needs-migration (legacy key path)", async () => {
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await openCheckoutOperation(BASE)).toEqual({ kind: "needs-migration" });
  });

  it("any other insert error → error (route fails closed)", async () => {
    installFakeAdmin(() => ({ error: { code: "XX000" } }));
    expect(await openCheckoutOperation(BASE)).toEqual({ kind: "error", reason: "insert_failed" });
  });

  it("collision whose winner vanished twice → contention error, never a guess", async () => {
    installFakeAdmin((c) => (c.op === "insert" ? { error: { code: "23505" } } : { data: null }));
    expect(await openCheckoutOperation(BASE)).toEqual({ kind: "error", reason: "contention" });
  });
});

describe("bookkeeping writes", () => {
  it("attachProviderSession records the session on the operation", async () => {
    const calls = installFakeAdmin(() => ({}));
    await attachProviderSession("op-1", "cs_1");
    expect(calls[0].args[0]).toEqual(expect.objectContaining({ provider_session_id: "cs_1" }));
    expect(calls[0].filters).toEqual([["id", "op-1"]]);
  });

  it("markCheckoutOperationFailed closes ONLY an open operation", async () => {
    const calls = installFakeAdmin(() => ({}));
    await markCheckoutOperationFailed("op-1", "idempotency_error");
    expect(calls[0].args[0]).toEqual(expect.objectContaining({ status: "failed", failure_reason: "idempotency_error" }));
    expect(calls[0].filters).toEqual(expect.arrayContaining([["id", "op-1"], ["status", "open"]]));
  });

  it("completeCheckoutOperationBySession targets the session id; 42P01 → needs-migration", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await completeCheckoutOperationBySession({ sessionId: "cs_1", providerSubscriptionId: "sub_1" })).toBe("ok");
    expect(calls[0].args[0]).toEqual(expect.objectContaining({ status: "completed", provider_subscription_id: "sub_1" }));
    expect(calls[0].filters).toEqual(expect.arrayContaining([["provider_session_id", "cs_1"]]));
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await completeCheckoutOperationBySession({ sessionId: "cs_1", providerSubscriptionId: null })).toBe("needs-migration");
  });

  it("expireCheckoutOperationBySession closes only an open operation", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await expireCheckoutOperationBySession("cs_1")).toBe("ok");
    expect(calls[0].filters).toEqual(expect.arrayContaining([["provider_session_id", "cs_1"], ["status", "open"]]));
  });
});
