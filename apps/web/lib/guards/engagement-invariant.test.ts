import { describe, expect, it, vi, afterEach } from "vitest";

import type { EngagementInvariantResult } from "@/lib/booking/engagement-invariant";

/**
 * Accepted-booking → engagement invariant guard (§7 of beta stabilization).
 *
 * BEHAVIOURAL: every case drives the real module through a recording fake
 * database and asserts the CLASSIFICATION, not source strings. The scenarios
 * are the production incident and its neighbours:
 *
 *   - the 2026-08-06 silence (accepted, resolvable, no engagement) must be a
 *     VIOLATION — the exact state that stayed invisible for two days;
 *   - the RPC's honest non-mint states must NOT be violations, because
 *     turning honesty into a standing alarm teaches operators to ignore it;
 *   - the already_active arm must count as covered;
 *   - a missing table degrades to `unavailable`, never to a fake zero.
 */

interface Fixture {
  bookings?: Record<string, unknown>[];
  demands?: Record<string, unknown>[];
  orgs?: Record<string, unknown>[];
  companies?: Record<string, unknown>[];
  engagements?: Record<string, unknown>[];
  errorOn?: string;
}

function fakeDb(f: Fixture) {
  const data: Record<string, Record<string, unknown>[]> = {
    booking_requests: f.bookings ?? [],
    customer_requests: f.demands ?? [],
    organizations: f.orgs ?? [],
    companies: f.companies ?? [],
    company_worker_engagements: f.engagements ?? [],
  };
  const table = (name: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () =>
        Promise.resolve(
          f.errorOn === name
            ? { data: null, error: { code: "42P01" } }
            : { data: data[name], error: null },
        ),
      then: (resolve: (v: unknown) => void) =>
        resolve(
          f.errorOn === name
            ? { data: null, error: { code: "42P01" } }
            : { data: data[name], error: null },
        ),
    };
    return chain;
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
    from: (name: string) => table(name),
  };
}

async function run(f: Fixture): Promise<EngagementInvariantResult> {
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => fakeDb(f) }));
  vi.resetModules();
  const mod = await import("@/lib/booking/engagement-invariant");
  return mod.checkEngagementInvariant();
}

afterEach(() => {
  vi.doUnmock("@/lib/supabase/server");
  vi.resetModules();
});

const OWNER = "owner-1";
const WORKER = "worker-1";

const booking = (id: string, request: string, owner = OWNER) => ({
  id,
  worker_id: WORKER,
  owner_id: owner,
  request_id: request,
});

describe("the 2026-08-06 silence is a VIOLATION, loudly", () => {
  it("accepted + org resolves a company + no engagement → VIOLATION", async () => {
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [
        { id: "co-a", profile_id: OWNER },
        { id: "co-b", profile_id: OWNER },
      ],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(1);
    expect(out.rows[0]).toMatchObject({
      status: "VIOLATION",
      resolvedCompanyId: "co-a",
    });
  });

  it("NULL-org demand + SINGLE company + no engagement → VIOLATION too", async () => {
    // The legacy singleton rule also promises an engagement; its silence is
    // just as much a violation as the org-first path's.
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: null }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(1);
  });
});

describe("satisfied states are not alarms", () => {
  it("an engagement row for the booking → engaged, zero violations", async () => {
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [
        { company_id: "co-a", worker_id: WORKER, source_booking_id: "b1", status: "active" },
      ],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    expect(out.rows[0].status).toBe("engaged");
  });

  it("the already_active arm counts as covered_active, not a violation", async () => {
    // Booking b2 minted nothing because the (company, worker) pair was
    // already actively engaged via b1 — the RPC's designed outcome.
    const out = await run({
      bookings: [booking("b1", "d1"), booking("b2", "d2")],
      demands: [
        { id: "d1", profile_id: OWNER, organization_id: "org-a" },
        { id: "d2", profile_id: OWNER, organization_id: "org-a" },
      ],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [
        { company_id: "co-a", worker_id: WORKER, source_booking_id: "b1", status: "active" },
      ],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    expect(out.rows.map((r) => r.status).sort()).toEqual(["covered_active", "engaged"]);
  });
});

describe("honest non-mint states stay honest — visible, not violations", () => {
  it("company-less organization (agency/team) → honest_non_mint", async () => {
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-nc" }],
      orgs: [{ id: "org-nc", legacy_company_id: null }],
      companies: [],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    expect(out.rows[0]).toMatchObject({
      status: "honest_non_mint",
      reason: "org_without_company",
    });
  });

  it("NULL-org demand from a multi-company owner → ambiguous, not violation", async () => {
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: null }],
      companies: [
        { id: "co-a", profile_id: OWNER },
        { id: "co-b", profile_id: OWNER },
      ],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    expect(out.rows[0].reason).toBe("ambiguous_company");
  });

  it("broken origin invariant (demand owner ≠ booking owner) → broken_origin", async () => {
    const out = await run({
      bookings: [booking("b1", "d1", "someone-else")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    expect(out.rows[0].reason).toBe("broken_origin");
  });
});

describe("the owner-classified LEGACY_EXCEPTION (88a43ead) is visible, not RED", () => {
  const LEGACY_ID = "88a43ead-2fe1-4891-bdae-8b5019f980d9";

  it("the exact legacy booking id → legacy_exception, zero violations", async () => {
    const out = await run({
      bookings: [booking(LEGACY_ID, "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(0);
    // Still LISTED — the exception is visible, never hidden.
    expect(out.rows[0]).toMatchObject({
      bookingId: LEGACY_ID,
      status: "legacy_exception",
      resolvedCompanyId: "co-a",
    });
  });

  it("NEGATIVE CONTROL: any other booking in the same state is still a VIOLATION", async () => {
    const out = await run({
      bookings: [booking(LEGACY_ID, "d1"), booking("b-new", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.violationCount).toBe(1);
    expect(out.rows.find((r) => r.bookingId === "b-new")?.status).toBe("VIOLATION");
  });

  it("an ENGAGED legacy id reports engaged, not legacy_exception", async () => {
    // The allowlist only downgrades what would otherwise be a violation —
    // it never rewrites a healthy state.
    const out = await run({
      bookings: [booking(LEGACY_ID, "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      orgs: [{ id: "org-a", legacy_company_id: "co-a" }],
      companies: [{ id: "co-a", profile_id: OWNER }],
      engagements: [
        { company_id: "co-a", worker_id: WORKER, source_booking_id: LEGACY_ID, status: "active" },
      ],
    });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.rows[0].status).toBe("engaged");
  });
});

describe("degradation is honest", () => {
  it("a missing relation is `unavailable`, never a comforting zero", async () => {
    const out = await run({
      bookings: [booking("b1", "d1")],
      demands: [{ id: "d1", profile_id: OWNER, organization_id: "org-a" }],
      errorOn: "company_worker_engagements",
    });
    expect(out.status).toBe("unavailable");
  });

  it("zero accepted bookings is an honest ok/0, not an error", async () => {
    const out = await run({ bookings: [] });
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.acceptedCount).toBe(0);
    expect(out.violationCount).toBe(0);
  });
});
