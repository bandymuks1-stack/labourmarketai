import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { readRecoveryCandidates } from "./subscription-store";

interface Script {
  subs: { data?: unknown; error?: { code: string } | null };
  audits?: { data?: unknown; error?: { code: string } | null };
  count?: number;
}

function install(s: Script) {
  const log: Array<[string, string, unknown[]]> = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "not", "lt", "gte", "order"]) {
        q[m] = (...a: unknown[]) => {
          log.push([table, m, a]);
          return q;
        };
      }
      q.limit = (...a: unknown[]) => {
        log.push([table, "limit", a]);
        const r = table === "billing_subscriptions" ? s.subs : (s.audits ?? { data: [] });
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
      };
      q.then = (res: (v: unknown) => unknown) => res({ count: s.count ?? 0, error: null });
      return q;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return log;
}

const input = {
  testMode: true,
  staleBeforeIso: "2026-01-01T00:00:00.000Z",
  cooldownFromIso: "2026-01-02T00:00:00.000Z",
  fetchLimit: 100,
  reconcileEventType: "reconcile.subscription",
};

beforeEach(() => vi.clearAllMocks());

describe("readRecoveryCandidates", () => {
  it("is READ-ONLY and scoped: mode, link-only statuses, no manual_ rows, stale cut-off, oldest first, bounded", async () => {
    const log = install({
      subs: { data: [{ provider_subscription_id: "sub_a" }, { provider_subscription_id: "manual_x" }, { provider_subscription_id: null }] },
      audits: { data: [{ payload: { subscription_id: "sub_a" } }, { payload: {} }] },
      count: 3,
    });
    const r = await readRecoveryCandidates(input);
    expect(r).toEqual({ ok: true, ids: ["sub_a"], recentlyReconciled: ["sub_a"], unprocessedWebhookEvents: 3 });
    const sub = log.filter(([t]) => t === "billing_subscriptions");
    const flat = JSON.stringify(sub);
    expect(flat).toContain('"test_mode",true');
    expect(flat).toContain('["incomplete","none"]');
    expect(flat).toContain('"like","manual%"');
    expect(flat).toContain('"updated_at","2026-01-01T00:00:00.000Z"');
    expect(flat).toContain('"ascending":true');
    expect(flat).toContain("[100]");
    // no write verb was ever used
    expect(log.some(([, m]) => ["insert", "update", "upsert", "delete"].includes(m))).toBe(false);
  });

  it("missing table -> needs_migration; other error -> store_error", async () => {
    install({ subs: { error: { code: "42P01" } } });
    expect(await readRecoveryCandidates(input)).toEqual({ ok: false, reason: "needs_migration" });
    install({ subs: { error: { code: "XX000" } } });
    expect(await readRecoveryCandidates(input)).toEqual({ ok: false, reason: "store_error" });
  });
});
