/**
 * Behavioural regression tests — subscription store fail-closed org linkage
 * (Codex round 2 P1).
 *
 * Two invariants pinned here:
 *   1. upsertSubscription MUST NOT silently strip a verified organization
 *      binding and persist an org subscription under the personal uniqueness
 *      model. When the organization_id column is not migrated yet (42703) it
 *      fails closed with "needs-migration" — it never retries without the
 *      column.
 *   2. isOrganizationLinkageReady fails CLOSED: a missing column (42703),
 *      missing table (42P01), or any other read error → not ready (false);
 *      only a clean read → ready (true).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// A tiny chainable Supabase stub: every builder method returns the builder,
// and awaiting the builder resolves the next scripted { data, error } result.
const h = vi.hoisted(() => {
  const state: { results: Array<{ data?: unknown; error?: unknown }> } = {
    results: [],
  };
  const makeClient = () => {
    const builder: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(state.results.shift() ?? { data: null, error: null });
          }
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

import {
  upsertSubscription,
  isOrganizationLinkageReady,
} from "./subscription-store";
import type { SubscriptionUpsert } from "./webhook-core";

const COLUMN_ABSENT = "42703";
const RELATION_ABSENT = "42P01";

function orgUpsert(): SubscriptionUpsert {
  return {
    providerSubscriptionId: "sub_test_1",
    providerCustomerId: "cus_test_1",
    ownerId: "11111111-1111-1111-1111-111111111111",
    planKey: "company_pilot",
    organizationId: "22222222-2222-2222-2222-222222222222",
    status: "incomplete",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    testMode: true,
  };
}

beforeEach(() => {
  h.state.results = [];
});

describe("upsertSubscription — org linkage fails closed until migrated", () => {
  it("returns needs-migration (never retries without the column) on 42703", async () => {
    // select (no existing) → upsert rejects with undefined column.
    h.state.results = [
      { data: null, error: null },
      { data: null, error: { code: COLUMN_ABSENT } },
    ];
    const result = await upsertSubscription(orgUpsert());
    expect(result).toBe("needs-migration");
    // Fail-closed proof: the second (org) upsert was the LAST call — a legacy
    // retry-without-org would have consumed a third scripted result.
    expect(h.state.results.length).toBe(0);
  });

  it("persists normally once the column exists", async () => {
    h.state.results = [
      { data: null, error: null }, // no existing row
      { data: null, error: null }, // upsert ok
    ];
    const result = await upsertSubscription(orgUpsert());
    expect(result).toBe("ok");
  });

  it("still returns needs-migration when the whole table is absent", async () => {
    h.state.results = [{ data: null, error: { code: RELATION_ABSENT } }];
    const result = await upsertSubscription(orgUpsert());
    expect(result).toBe("needs-migration");
  });
});

describe("isOrganizationLinkageReady — fails closed", () => {
  it("is ready only on a clean read", async () => {
    h.state.results = [{ data: [], error: null }];
    expect(await isOrganizationLinkageReady()).toBe(true);
  });

  it("is not ready when the organization_id column is absent (42703)", async () => {
    h.state.results = [{ data: null, error: { code: COLUMN_ABSENT } }];
    expect(await isOrganizationLinkageReady()).toBe(false);
  });

  it("is not ready when the table is absent (42P01)", async () => {
    h.state.results = [{ data: null, error: { code: RELATION_ABSENT } }];
    expect(await isOrganizationLinkageReady()).toBe(false);
  });

  it("is not ready on any other read error (fail closed, never open)", async () => {
    h.state.results = [{ data: null, error: { code: "08006" } }];
    expect(await isOrganizationLinkageReady()).toBe(false);
  });
});
