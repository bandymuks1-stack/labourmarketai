/**
 * T7 — the administrator sees how many requests are unhandled and how long they
 * have waited, oldest first with an overdue marker; a status change records who
 * and when. Synthetic rows; the database is a fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  superadmin: true,
  rows: [] as Record<string, unknown>[],
  auditColumns: true,
  updates: [] as Record<string, unknown>[],
  userId: "00000000-0000-4000-8000-0000000000e1" as string | null,
}));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: async () => state.superadmin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ in: async () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000e1", email: "qa.operator@example.test" }], error: null }) }) };
      }
      return {
        select(cols: string) {
          const missing = !state.auditColumns && cols.includes("status_changed_at");
          return { order: async () => (missing ? { data: null, error: { code: "42703" } } : { data: state.rows, error: null }) };
        },
        update(patch: Record<string, unknown>) {
          const missing = !state.auditColumns && "status_changed_at" in patch;
          return {
            eq: (_c: string, id: string) => ({
              select: async () => {
                if (missing) return { data: null, error: { code: "PGRST204" } };
                const row = state.rows.find((r) => r.id === id);
                if (!row) return { data: [], error: null };
                state.updates.push(patch);
                Object.assign(row, patch);
                return { data: [{ id }], error: null };
              },
            }),
          };
        },
      };
    },
  }),
}));

import {
  DEFAULT_INTAKE_OVERDUE_HOURS,
  compareIntakesForQueue,
  intakeOverdueHours,
  intakeWaitingHours,
  isIntakeOverdue,
  unhandledIntakeSummary,
} from "./company-need-intake-shared";
import { listCompanyNeedIntakes, setCompanyNeedIntakeStatus } from "./company-need-intakes";

const NOW = Date.parse("2026-11-13T20:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const row = (id: string, status: string, h: number, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: hoursAgo(h),
  status,
  company_name: `QA-SYNTHETIC ${id}`,
  description: "QA-SYNTHETIC",
  country: "LT",
  ...extra,
});

beforeEach(() => {
  state.superadmin = true;
  state.auditColumns = true;
  state.updates = [];
  state.userId = "00000000-0000-4000-8000-0000000000e1";
  state.rows = [row("a", "new", 2), row("b", "new", 30), row("c", "contacted", 1), row("d", "new", 50), row("e", "rejected", 90)];
});

describe("the unhandled count and age", () => {
  const rows = () => state.rows.map((r) => ({ status: r.status as string, createdAt: r.created_at as string }));

  it("counts only `new` rows and reports the longest wait", () => {
    expect(unhandledIntakeSummary(rows(), NOW, 24)).toEqual({ count: 3, overdueCount: 2, oldestWaitingHours: 50 });
  });

  it("nothing unhandled → zero and no age (never a made-up 0 h)", () => {
    expect(unhandledIntakeSummary([{ status: "contacted", createdAt: hoursAgo(99) }], NOW, 24)).toEqual({ count: 0, overdueCount: 0, oldestWaitingHours: null });
  });

  it("overdue is only ever an unhandled row past the threshold", () => {
    expect(isIntakeOverdue({ status: "new", createdAt: hoursAgo(24) }, NOW, 24)).toBe(true);
    expect(isIntakeOverdue({ status: "new", createdAt: hoursAgo(23) }, NOW, 24)).toBe(false);
    expect(isIntakeOverdue({ status: "contacted", createdAt: hoursAgo(500) }, NOW, 24)).toBe(false);
    expect(isIntakeOverdue({ status: "new", createdAt: "not a date" }, NOW, 24)).toBe(false);
    expect(intakeWaitingHours("not a date", NOW)).toBeNull();
  });

  it("the threshold is configuration, bounded, 24 h by default", () => {
    expect(DEFAULT_INTAKE_OVERDUE_HOURS).toBe(24);
    expect(intakeOverdueHours({})).toBe(24);
    expect(intakeOverdueHours({ LM_INTAKE_OVERDUE_HOURS: "8" })).toBe(8);
    for (const bad of ["0", "-1", "abc", "100000", "1.5"]) expect(intakeOverdueHours({ LM_INTAKE_OVERDUE_HOURS: bad })).toBe(24);
  });

  it("queue order: unhandled first and OLDEST first, then handled, newest first", () => {
    const sorted = [...state.rows].map((r) => ({ id: r.id, status: r.status as never, createdAt: r.created_at as string })).sort(compareIntakesForQueue);
    expect(sorted.map((r) => r.id)).toEqual(["d", "b", "a", "c", "e"]);
  });
});

describe("the queue as the administrator reads it", () => {
  it("lists unhandled rows oldest first", async () => {
    const r = await listCompanyNeedIntakes();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.rows.map((x) => x.id)).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("is refused to anyone who is not a superadmin", async () => {
    state.superadmin = false;
    expect(await listCompanyNeedIntakes()).toEqual({ kind: "not-admin" });
    expect(await setCompanyNeedIntakeStatus("a", "contacted")).toEqual({ kind: "not-admin" });
    expect(state.updates).toEqual([]);
  });

  it("still works before the who/when columns exist", async () => {
    state.auditColumns = false;
    const r = await listCompanyNeedIntakes();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.rows[0]).toMatchObject({ id: "d", statusChangedAt: null, statusChangedBy: null });
  });
});

describe("a status change records who and when", () => {
  it("writes the operator and the server time with the status", async () => {
    const before = Date.now();
    expect(await setCompanyNeedIntakeStatus("b", "contacted")).toEqual({ kind: "ok" });
    expect(state.updates).toHaveLength(1);
    const patch = state.updates[0];
    expect(patch.status).toBe("contacted");
    expect(patch.status_changed_by).toBe("00000000-0000-4000-8000-0000000000e1");
    expect(Date.parse(patch.status_changed_at as string)).toBeGreaterThanOrEqual(before);
    expect(Object.keys(patch).sort()).toEqual(["status", "status_changed_at", "status_changed_by"]);
  });

  it("the queue then names who changed it and when", async () => {
    await setCompanyNeedIntakeStatus("b", "contacted");
    const r = await listCompanyNeedIntakes();
    if (r.kind !== "ok") throw new Error("list failed");
    const changed = r.rows.find((x) => x.id === "b");
    expect(changed).toMatchObject({ status: "contacted", statusChangedBy: "qa.operator@example.test" });
    expect(changed?.statusChangedAt).toMatch(/^2\d{3}-/);
    // a handled row is no longer counted as unhandled
    expect(unhandledIntakeSummary(r.rows, NOW, 24).count).toBe(2);
  });

  it("before the migration the status is still saved (without who/when), never an error", async () => {
    state.auditColumns = false;
    expect(await setCompanyNeedIntakeStatus("a", "rejected")).toEqual({ kind: "ok" });
    expect(state.updates).toEqual([{ status: "rejected" }]);
  });

  it("an operator cannot set `converted`, and an unknown row is not-found", async () => {
    expect(await setCompanyNeedIntakeStatus("a", "converted")).toEqual({ kind: "invalid" });
    expect(await setCompanyNeedIntakeStatus("zzz", "contacted")).toEqual({ kind: "not-found" });
  });
});
