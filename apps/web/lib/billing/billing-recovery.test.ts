import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = vi.hoisted(() => ({ state: "stripe_test" as string }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/billing/reconcile-subscription", () => ({
  RECONCILE_EVENT_TYPE: "reconcile.subscription",
  reconcileSubscription: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  pickBatch,
  runBillingRecovery,
  selectRecoveryCandidates,
  RECOVERY_BATCH,
  RUN_BUDGET_MS,
} from "@/lib/billing/billing-recovery";

interface Fake {
  subs: Array<{ provider_subscription_id: string | null; updated_at: string }> | { error: { code: string } };
  audits?: Array<{ payload: Record<string, unknown> }>;
  unprocessed?: number;
}

function installAdmin(f: Fake) {
  const filters: Array<[string, string, unknown]> = [];
  let limitSeen = -1;
  vi.mocked(createAdminClient).mockReturnValue({
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const m of ["select", "eq", "neq", "in", "not", "lt", "gte", "order"]) {
        q[m] = (...a: unknown[]) => {
          filters.push([table, m, a]);
          return chain();
        };
      }
      q.limit = (n: number) => {
        if (table === "billing_subscriptions") limitSeen = n;
        const done =
          table === "billing_subscriptions"
            ? "error" in f.subs
              ? { data: null, error: f.subs.error }
              : { data: f.subs, error: null }
            : { data: f.audits ?? [], error: null };
        return Promise.resolve(done);
      };
      // count query (head) is awaited directly after .lt()
      q.then = (res: (v: unknown) => unknown) => res({ count: f.unprocessed ?? 0, error: null });
      return q;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { filters, limit: () => limitSeen };
}

const old = new Date(0).toISOString();
const subs = (n: number) => Array.from({ length: n }, (_, i) => ({ provider_subscription_id: `sub_${i}`, updated_at: old }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  cfg.state = "stripe_test";
});

describe("pickBatch", () => {
  it("bounds, preserves oldest-first order, skips cooled-down subscriptions", () => {
    const ids = ["a", "b", "c", "d"];
    expect(pickBatch(ids, new Set(["b"]), 2)).toEqual(["a", "c"]);
  });
});

describe("selectRecoveryCandidates", () => {
  it("restricts to adapter mode, incomplete/none rows, no manual_ rows, oldest first, over-fetching a bounded window", async () => {
    const h = installAdmin({ subs: subs(3) });
    const r = await selectRecoveryCandidates({ testMode: true, now: () => 10_000_000 });
    expect(r).toMatchObject({ ok: true, ids: ["sub_0", "sub_1", "sub_2"] });
    const f = h.filters.filter(([t]) => t === "billing_subscriptions").map(([, m, a]) => [m, a] as const);
    expect(JSON.stringify(f)).toContain('"test_mode",true');
    expect(JSON.stringify(f)).toContain('"incomplete","none"');
    expect(JSON.stringify(f)).toContain("manual");
    expect(JSON.stringify(f)).toContain('"updated_at",{"ascending":true}');
    expect(h.limit()).toBe(RECOVERY_BATCH * 4);
  });

  it("never returns more than the batch, even if asked for more", async () => {
    installAdmin({ subs: subs(100) });
    const r = await selectRecoveryCandidates({ testMode: false, limit: 500 });
    expect(r.ok && r.ids.length).toBe(RECOVERY_BATCH);
  });

  it("skips subscriptions reconciled within the cooldown (no starvation by a stuck row)", async () => {
    installAdmin({ subs: subs(3), audits: [{ payload: { subscription_id: "sub_0" } }] });
    const r = await selectRecoveryCandidates({ testMode: true });
    expect(r.ok && r.ids).toEqual(["sub_1", "sub_2"]);
  });

  it("table absent -> needs_migration; other error -> store_error", async () => {
    installAdmin({ subs: { error: { code: "42P01" } } });
    expect(await selectRecoveryCandidates({ testMode: true })).toEqual({ ok: false, reason: "needs_migration" });
    installAdmin({ subs: { error: { code: "XX000" } } });
    expect(await selectRecoveryCandidates({ testMode: true })).toEqual({ ok: false, reason: "store_error" });
  });
});

describe("runBillingRecovery", () => {
  it("inactive billing -> unavailable, nothing selected", async () => {
    cfg.state = "disabled";
    expect(await runBillingRecovery()).toEqual({ kind: "unavailable", reason: "billing_inactive" });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("one subscription's failure (throw) does not corrupt or abort the batch", async () => {
    installAdmin({ subs: subs(3), unprocessed: 2 });
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce({ outcome: "applied" })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ outcome: "stale" });
    const r = await runBillingRecovery({ reconcile });
    expect(r).toMatchObject({
      kind: "ok",
      mode: "test",
      selected: 3,
      processed: 3,
      counts: { applied: 1, store_error: 1, stale: 1 },
      unprocessedWebhookEvents: 2,
    });
  });

  it("stops at the wall-clock budget and reports what it skipped", async () => {
    installAdmin({ subs: subs(3) });
    let t = 0;
    const now = () => t;
    const reconcile = vi.fn(async () => {
      t += RUN_BUDGET_MS + 1;
      return { outcome: "applied" as const };
    });
    const r = await runBillingRecovery({ reconcile, now });
    expect(r).toMatchObject({ processed: 1, skippedBudget: 2 });
  });

  it("response never carries subscription ids", async () => {
    installAdmin({ subs: subs(1) });
    const r = await runBillingRecovery({ reconcile: async () => ({ outcome: "applied", providerSubscriptionId: "sub_0" }) });
    expect(JSON.stringify(r)).not.toContain("sub_");
  });
});
