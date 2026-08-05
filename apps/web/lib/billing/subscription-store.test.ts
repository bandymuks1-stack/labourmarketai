/**
 * Subscription store — retryable idempotency + re-subscribe collision fix.
 *
 * Proves, against a scripted fake of the service-role client:
 *  1. recordWebhookEvent splits duplicates by processed state
 *     (duplicate-processed → skip; duplicate-unprocessed → reprocessable) and
 *     surfaces an unreadable idempotency store as "error", never as a
 *     silent success.
 *  2. markWebhookProcessed closes the record (processed=true, error cleared);
 *     markWebhookFailed keeps it OPEN (processed=false) so a Stripe retry is
 *     reprocessed instead of skipped forever.
 *  3. upsertSubscription falls back on a 23505 from the
 *     (owner_id, plan_key, provider) unique key: the existing row for that
 *     owner+plan (re-subscribe after cancel, or a manual_<uuid> pilot
 *     override) is updated IN PLACE with the new provider subscription —
 *     the paying user never loses the write.
 *  4. applyInvoicePayment is a no-op-safe repeated write (invoice.paid +
 *     invoice.payment_succeeded pairs are harmless).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  upsertSubscription,
  applyInvoicePayment,
} from "./subscription-store";
import type { SubscriptionUpsert } from "./webhook-core";

// ─── scripted fake supabase admin client ────────────────────────────────────

interface Call {
  table: string;
  op: "insert" | "update" | "upsert" | "select";
  args: unknown[];
  filters: Array<[string, unknown]>;
}

type Outcome = { data?: unknown; error?: { code?: string; message?: string } | null };
type Handler = (call: Call) => Outcome;

function installFakeAdmin(handler: Handler): Call[] {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const make = (op: Call["op"], args: unknown[]) => {
        const call: Call = { table, op, args, filters: [] };
        calls.push(call);
        const finish = () => {
          const out = handler(call);
          return { data: out.data ?? null, error: out.error ?? null };
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = {
          eq(col: string, val: unknown) {
            call.filters.push([col, val]);
            return builder;
          },
          maybeSingle: () => Promise.resolve(finish()),
          then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
            return Promise.resolve(finish()).then(onOk, onErr);
          },
        };
        return builder;
      };
      return {
        insert: (...args: unknown[]) => make("insert", args),
        update: (...args: unknown[]) => make("update", args),
        upsert: (...args: unknown[]) => make("upsert", args),
        select: (...args: unknown[]) => make("select", args),
      };
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(
    client as unknown as ReturnType<typeof createAdminClient>,
  );
  return calls;
}

const EVENT = {
  eventId: "evt_1",
  eventType: "invoice.paid",
  testMode: true,
  payload: { id: "evt_1", type: "invoice.paid" },
};

const SUB: SubscriptionUpsert = {
  providerSubscriptionId: "sub_new",
  providerCustomerId: "cus_1",
  ownerId: "owner_1",
  planKey: "company_pilot",
  status: "active",
  currentPeriodStart: "2026-08-01T00:00:00.000Z",
  currentPeriodEnd: "2026-09-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  testMode: true,
};

beforeEach(() => vi.clearAllMocks());

// ─── 1. recordWebhookEvent duplicate semantics ──────────────────────────────

describe("recordWebhookEvent — retry-safe idempotency record", () => {
  it("fresh event → ok", async () => {
    installFakeAdmin(() => ({}));
    expect(await recordWebhookEvent(EVENT)).toBe("ok");
  });

  it("tables absent → needs-migration", async () => {
    installFakeAdmin(() => ({ error: { code: "42P01" } }));
    expect(await recordWebhookEvent(EVENT)).toBe("needs-migration");
  });

  it("duplicate of a PROCESSED event → duplicate-processed (safe to skip)", async () => {
    installFakeAdmin((call) =>
      call.op === "insert"
        ? { error: { code: "23505" } }
        : { data: { processed: true } },
    );
    expect(await recordWebhookEvent(EVENT)).toBe("duplicate-processed");
  });

  it("duplicate of an UNPROCESSED event → duplicate-unprocessed (must reprocess)", async () => {
    const calls = installFakeAdmin((call) =>
      call.op === "insert"
        ? { error: { code: "23505" } }
        : { data: { processed: false } },
    );
    expect(await recordWebhookEvent(EVENT)).toBe("duplicate-unprocessed");
    const sel = calls.find((c) => c.op === "select")!;
    expect(sel.table).toBe("payment_webhook_events");
    expect(sel.filters).toContainEqual(["event_id", "evt_1"]);
    expect(sel.filters).toContainEqual(["provider", "stripe"]);
  });

  it("duplicate whose processed state cannot be read → error (never silent)", async () => {
    installFakeAdmin((call) =>
      call.op === "insert"
        ? { error: { code: "23505" } }
        : { error: { code: "XX000" } },
    );
    expect(await recordWebhookEvent(EVENT)).toBe("error");
  });

  it("any other insert failure → error (route must answer non-2xx)", async () => {
    const calls = installFakeAdmin(() => ({ error: { code: "XX000" } }));
    expect(await recordWebhookEvent(EVENT)).toBe("error");
    expect(calls.filter((c) => c.op === "select")).toHaveLength(0);
  });
});

// ─── 2. processed vs failed marks ───────────────────────────────────────────

describe("markWebhookProcessed / markWebhookFailed", () => {
  it("processed closes the record: processed=true, error cleared", async () => {
    const calls = installFakeAdmin(() => ({}));
    await markWebhookProcessed("evt_1");
    const upd = calls[0];
    expect(upd.op).toBe("update");
    const patch = upd.args[0] as Record<string, unknown>;
    expect(patch.processed).toBe(true);
    expect(patch.error).toBeNull();
    expect(typeof patch.processed_at).toBe("string");
  });

  it("failed keeps the record OPEN: processed stays false (retryable)", async () => {
    const calls = installFakeAdmin(() => ({}));
    await markWebhookFailed("evt_1", "boom");
    const upd = calls[0];
    expect(upd.op).toBe("update");
    const patch = upd.args[0] as Record<string, unknown>;
    expect(patch.processed).toBe(false);
    expect(patch.error).toBe("boom");
  });
});

// ─── 3. upsertSubscription re-subscribe / pilot-override collision ──────────

describe("upsertSubscription — (owner, plan, provider) collision fallback", () => {
  it("no collision → plain upsert, no fallback update", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await upsertSubscription(SUB)).toBe("ok");
    expect(calls.map((c) => c.op)).toEqual(["select", "upsert"]);
  });

  it("23505 (re-subscribe after cancel) → updates the existing owner+plan row with the NEW subscription id", async () => {
    const calls = installFakeAdmin((call) =>
      call.op === "upsert" ? { error: { code: "23505" } } : {},
    );
    expect(await upsertSubscription(SUB)).toBe("ok");
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.table).toBe("billing_subscriptions");
    // Row identified by the colliding unique key…
    expect(upd.filters).toContainEqual(["provider", "stripe"]);
    expect(upd.filters).toContainEqual(["owner_id", "owner_1"]);
    expect(upd.filters).toContainEqual(["plan_key", "company_pilot"]);
    // …and the provider subscription id is REPLACED along with state.
    const patch = upd.args[0] as Record<string, unknown>;
    expect(patch.provider_subscription_id).toBe("sub_new");
    expect(patch.status).toBe("active");
    expect(patch.current_period_end).toBe(SUB.currentPeriodEnd);
    // owner/plan/provider are the row's identity — never rewritten.
    expect(patch.owner_id).toBeUndefined();
    expect(patch.plan_key).toBeUndefined();
  });

  it("23505 while a manual_<uuid> pilot-override row holds owner+plan → the override row becomes the real subscription", async () => {
    // The override row (provider_subscription_id = manual_…) owns the
    // (owner_id, plan_key, provider) key, so the checkout upsert collides;
    // the fallback must update THAT row in place — the user who just paid
    // must end up with the paid subscription, not a swallowed 23505.
    const calls = installFakeAdmin((call) => {
      if (call.op === "select") return { data: null }; // no row for sub_new
      if (call.op === "upsert") return { error: { code: "23505" } };
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("ok");
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.filters).toContainEqual(["owner_id", "owner_1"]);
    expect(upd.filters).toContainEqual(["plan_key", "company_pilot"]);
    expect((upd.args[0] as Record<string, unknown>).provider_subscription_id).toBe("sub_new");
  });

  it("fallback update failure is surfaced (error / needs-migration)", async () => {
    installFakeAdmin((call) => {
      if (call.op === "upsert") return { error: { code: "23505" } };
      if (call.op === "update") return { error: { code: "XX000" } };
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("error");

    installFakeAdmin((call) => {
      if (call.op === "upsert") return { error: { code: "23505" } };
      if (call.op === "update") return { error: { code: "42P01" } };
      return {};
    });
    expect(await upsertSubscription(SUB)).toBe("needs-migration");
  });

  it("a bare subscription event before checkout (no owner/plan, no row) is still ignored safely", async () => {
    const calls = installFakeAdmin(() => ({ data: null }));
    expect(
      await upsertSubscription({ ...SUB, ownerId: null, planKey: null }),
    ).toBe("ok");
    expect(calls.map((c) => c.op)).toEqual(["select"]); // no write attempted
  });
});

// ─── 4. applyInvoicePayment repeat-safety ───────────────────────────────────

describe("applyInvoicePayment — duplicate success events are a no-op", () => {
  it("applying 'succeeded' twice issues the SAME idempotent patch (no status change)", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await applyInvoicePayment("sub_1", "succeeded")).toBe("ok");
    expect(await applyInvoicePayment("sub_1", "succeeded")).toBe("ok");
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(2);
    for (const upd of updates) {
      const patch = upd.args[0] as Record<string, unknown>;
      expect(patch.last_payment_status).toBe("succeeded");
      expect(patch.status).toBeUndefined(); // success never rewrites status
      expect(upd.filters).toContainEqual(["provider_subscription_id", "sub_1"]);
    }
  });

  it("a failed payment moves the subscription to past_due", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await applyInvoicePayment("sub_1", "failed")).toBe("ok");
    const patch = calls[0].args[0] as Record<string, unknown>;
    expect(patch.last_payment_status).toBe("failed");
    expect(patch.status).toBe("past_due");
  });

  it("no subscription id → acknowledged without any write", async () => {
    const calls = installFakeAdmin(() => ({}));
    expect(await applyInvoicePayment(null, "succeeded")).toBe("ok");
    expect(calls).toHaveLength(0);
  });
});
