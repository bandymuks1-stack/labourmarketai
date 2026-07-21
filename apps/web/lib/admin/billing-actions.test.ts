/**
 * Behavioural regression tests — manual pilot grant conflict target
 * (Codex round 2 P1).
 *
 * The Stripe TEST subscriptions v1 migration replaces the plain
 * `unique (owner_id, plan_key, provider)` constraint with a PARTIAL unique
 * index (…WHERE origin_organization_id IS NULL). PostgreSQL cannot infer a
 * partial index as an ON CONFLICT arbiter without its predicate, and
 * supabase-js cannot supply one — so grantPilotAccessAction must NOT rely on
 * onConflict. It uses find-then-write:
 *   - no existing manual grant → INSERT a fresh manual_ row;
 *   - existing manual grant     → UPDATE it back to active (idempotent);
 *   - a concurrent duplicate (23505) is treated as success;
 *   - a missing table (42P01)    → needs_migration.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state: {
    results: Array<{ data?: unknown; error?: unknown }>;
    calls: string[];
  } = { results: [], calls: [] };
  const makeClient = () => {
    const builder: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(state.results.shift() ?? { data: null, error: null });
          }
          if (typeof prop === "string") state.calls.push(prop);
          return () => builder;
        },
      },
    );
    return builder;
  };
  return { state, makeClient };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => h.makeClient(),
}));
vi.mock("@/lib/auth/superadmin", () => ({
  isSuperadmin: () => Promise.resolve(true),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { grantPilotAccessAction } from "./billing-actions";

const grant = () =>
  grantPilotAccessAction({
    locale: "en",
    ownerId: "11111111-1111-1111-1111-111111111111",
    planKey: "worker_plus",
  });

beforeEach(() => {
  h.state.results = [];
  h.state.calls = [];
});

describe("grantPilotAccessAction — no onConflict over a partial index", () => {
  it("inserts a fresh manual grant when none exists", async () => {
    h.state.results = [
      { data: null, error: null }, // find: none
      { data: null, error: null }, // insert ok
    ];
    const res = await grant();
    expect(res).toEqual({ ok: true });
    // find-then-write, never an onConflict upsert.
    expect(h.state.calls).toContain("insert");
    expect(h.state.calls).not.toContain("upsert");
  });

  it("reuses (updates) an existing manual grant idempotently", async () => {
    h.state.results = [
      { data: { id: "existing-row" }, error: null }, // find: exists
      { data: null, error: null }, // update ok
    ];
    const res = await grant();
    expect(res).toEqual({ ok: true });
    expect(h.state.calls).toContain("update");
    expect(h.state.calls).not.toContain("insert");
  });

  it("treats a concurrent duplicate (23505) as success", async () => {
    h.state.results = [
      { data: null, error: null }, // find: none
      { data: null, error: { code: "23505" } }, // insert races
    ];
    const res = await grant();
    expect(res).toEqual({ ok: true });
  });

  it("reports needs_migration when the billing table is absent", async () => {
    h.state.results = [{ data: null, error: { code: "42P01" } }];
    const res = await grant();
    expect(res).toEqual({ ok: false, reason: "needs_migration" });
  });
});
