import { describe, it, expect, vi, beforeEach } from "vitest";

const cfg = vi.hoisted(() => ({ state: "stripe_test" as string }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => cfg }));
vi.mock("@/lib/billing/subscription-store", () => ({ readRecoveryCandidates: vi.fn() }));
vi.mock("@/lib/billing/reconcile-subscription", () => ({
  RECONCILE_EVENT_TYPE: "reconcile.subscription",
  reconcileSubscription: vi.fn(),
}));

import { readRecoveryCandidates } from "@/lib/billing/subscription-store";
import {
  COOLDOWN_MS,
  pickBatch,
  RECOVERY_BATCH,
  runBillingRecovery,
  RUN_BUDGET_MS,
  selectRecoveryCandidates,
  STALE_AFTER_MS,
} from "@/lib/billing/billing-recovery";

const read = vi.mocked(readRecoveryCandidates);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `sub_${i}`);
const ok = (over: Partial<{ ids: string[]; recentlyReconciled: string[]; unprocessedWebhookEvents: number | null }> = {}) =>
  ({ ok: true as const, ids: [], recentlyReconciled: [], unprocessedWebhookEvents: 0, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  cfg.state = "stripe_test";
});

describe("pickBatch", () => {
  it("bounds, preserves oldest-first order, skips cooled-down subscriptions", () => {
    expect(pickBatch(["a", "b", "c", "d"], new Set(["b"]), 2)).toEqual(["a", "c"]);
  });
});

describe("selectRecoveryCandidates", () => {
  it("asks the store for the adapter's mode, the stale + cooldown windows and a bounded over-fetch", async () => {
    read.mockResolvedValue(ok({ ids: ids(3) }));
    const r = await selectRecoveryCandidates({ testMode: true, now: () => 10_000_000_000 });
    expect(r).toMatchObject({ ok: true, ids: ["sub_0", "sub_1", "sub_2"] });
    expect(read).toHaveBeenCalledWith({
      testMode: true,
      staleBeforeIso: new Date(10_000_000_000 - STALE_AFTER_MS).toISOString(),
      cooldownFromIso: new Date(10_000_000_000 - COOLDOWN_MS).toISOString(),
      fetchLimit: RECOVERY_BATCH * 4,
      reconcileEventType: "reconcile.subscription",
    });
  });

  it("never returns more than the batch, even if asked for more", async () => {
    read.mockResolvedValue(ok({ ids: ids(100) }));
    const r = await selectRecoveryCandidates({ testMode: false, limit: 500 });
    expect(r.ok && r.ids.length).toBe(RECOVERY_BATCH);
  });

  it("skips subscriptions reconciled within the cooldown (a stuck row cannot starve the queue)", async () => {
    read.mockResolvedValue(ok({ ids: ids(3), recentlyReconciled: ["sub_0"] }));
    const r = await selectRecoveryCandidates({ testMode: true });
    expect(r.ok && r.ids).toEqual(["sub_1", "sub_2"]);
  });

  it("store failures pass through as a reason, never a throw", async () => {
    read.mockResolvedValue({ ok: false, reason: "needs_migration" });
    expect(await selectRecoveryCandidates({ testMode: true })).toEqual({ ok: false, reason: "needs_migration" });
  });
});

describe("runBillingRecovery", () => {
  it("inactive billing -> unavailable, nothing read", async () => {
    cfg.state = "disabled";
    expect(await runBillingRecovery()).toEqual({ kind: "unavailable", reason: "billing_inactive" });
    expect(read).not.toHaveBeenCalled();
  });

  it("candidate read failure -> unavailable with the reason", async () => {
    read.mockResolvedValue({ ok: false, reason: "store_error" });
    expect(await runBillingRecovery()).toEqual({ kind: "unavailable", reason: "store_error" });
  });

  it("one subscription's failure (throw) does not corrupt or abort the batch", async () => {
    read.mockResolvedValue(ok({ ids: ids(3), unprocessedWebhookEvents: 2 }));
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
    read.mockResolvedValue(ok({ ids: ids(3) }));
    let t = 0;
    const reconcile = vi.fn(async () => {
      t += RUN_BUDGET_MS + 1;
      return { outcome: "applied" as const };
    });
    const r = await runBillingRecovery({ reconcile, now: () => t });
    expect(r).toMatchObject({ processed: 1, skippedBudget: 2 });
  });

  it("the run report never carries subscription ids", async () => {
    read.mockResolvedValue(ok({ ids: ids(1) }));
    const r = await runBillingRecovery({ reconcile: async () => ({ outcome: "applied", providerSubscriptionId: "sub_0" }) });
    expect(JSON.stringify(r)).not.toContain("sub_");
  });

  it("rerunning on the same state is safe: the sweep itself writes nothing, only reconcile does (idempotent)", async () => {
    read.mockResolvedValue(ok({ ids: ids(2) }));
    const reconcile = vi.fn(async () => ({ outcome: "noop" as const }));
    await runBillingRecovery({ reconcile });
    await runBillingRecovery({ reconcile });
    expect(reconcile).toHaveBeenCalledTimes(4);
  });
});
