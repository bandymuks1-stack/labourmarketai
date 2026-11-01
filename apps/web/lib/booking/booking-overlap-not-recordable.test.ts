import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/telemetry/server-funnel", () => ({ emitServerFunnelEvent: vi.fn() }));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitBookingNotification: vi.fn(),
  emitEngagementCreatedNotification: vi.fn(),
}));
vi.mock("@/lib/billing/effective-entitlements", () => ({ hasFeature: vi.fn(async () => true) }));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(async () => ({ kind: "ok" })),
}));
vi.mock("@/lib/company/stale-workspace", () => ({ refuseStaleWorkspace: vi.fn(async () => undefined) }));

import { createClient } from "@/lib/supabase/server";
import { respondBookingAction } from "@/lib/booking/booking-actions";
import { isOverlapExclusionViolation } from "@/lib/booking/booking-state";
import { mapKind } from "@/lib/conversation/executor-contract";

/**
 * THE ACKNOWLEDGED ACCEPT THE DATABASE REFUSED (production 2026-10-25 17:27
 * UTC, walk orders-bookings run 40216243755, step O-5).
 *
 * The worker was told the dates clash, chose "accept anyway", and
 * `respond_booking_request_v4(p_acknowledge_clash => true)` came back 400:
 * the table's exclusion constraint `booking_requests_no_overlapping_accepted`
 * still forbids two overlapping accepted rows. The action classified that
 * 23P01 as the plain `conflict`, so the UI re-showed the question the person
 * had just answered and the button visibly did nothing.
 *
 * These are the real error shapes PostgREST returned, verbatim.
 */
const HAND_CHECK = {
  code: "23P01",
  message: "Conflicting accepted booking for these dates",
};
const TABLE_CONSTRAINT = {
  code: "23P01",
  message:
    'conflicting key value violates exclusion constraint "booking_requests_no_overlapping_accepted"',
};

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };

function clientAnswering(answers: Record<string, RpcAnswer>) {
  const rpc = vi.fn(async (name: string) => answers[name] ?? { data: null, error: { code: "PGRST202" } });
  const quiet = (): Record<string, unknown> => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq", "order"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    return q;
  };
  return {
    rpc,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-worker" } } })) },
      from: vi.fn(() => quiet()),
      rpc,
    },
  };
}

describe("isOverlapExclusionViolation tells the table from the RPC's own check", () => {
  it("the exclusion constraint is the table", () => {
    expect(isOverlapExclusionViolation(TABLE_CONSTRAINT)).toBe(true);
  });

  it("the RPC's hand-rolled clash check is NOT the table", () => {
    expect(isOverlapExclusionViolation(HAND_CHECK)).toBe(false);
  });

  it("a constraint message without a code still counts", () => {
    expect(isOverlapExclusionViolation({ message: TABLE_CONSTRAINT.message })).toBe(true);
  });

  it("unrelated errors are not swallowed into it", () => {
    expect(isOverlapExclusionViolation({ code: "22023", message: "Booking is no longer open" })).toBe(false);
    expect(isOverlapExclusionViolation({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("respondBookingAction: the refused acknowledgement is its own answer", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("v4 + exclusion violation → overlap-not-recordable, never conflict", async () => {
    const { client, rpc } = clientAnswering({
      respond_booking_request_v4: { data: null, error: TABLE_CONSTRAINT },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await respondBookingAction({
      locale: "lt",
      bookingId: "b-1",
      decision: "accepted",
      acknowledgeClash: true,
    });
    expect(res).toEqual({ kind: "overlap-not-recordable" });
    // Exactly one write attempt: no silent fall-through to v3 or v1.
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["respond_booking_request_v4"]);
  });

  it("the DEFAULT accept is unchanged: v3's refusal is still the plain conflict", async () => {
    const { client, rpc } = clientAnswering({
      respond_booking_request_v3: { data: null, error: HAND_CHECK },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await respondBookingAction({ locale: "lt", bookingId: "b-1", decision: "accepted" });
    expect(res).toEqual({ kind: "conflict" });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["respond_booking_request_v3"]);
  });

  it("once the constraint is completed (RED), v4 succeeds and reports the receipt", async () => {
    const { client } = clientAnswering({
      respond_booking_request_v4: {
        data: { decision: "accepted", engagement: "already_active", acknowledged_clashes: 1 },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await respondBookingAction({
      locale: "lt",
      bookingId: "b-1",
      decision: "accepted",
      acknowledgeClash: true,
    });
    expect(res).toMatchObject({ kind: "ok", status: "accepted", acknowledgedClashes: 1 });
  });

  it("an absent v4 is still needs-migration", async () => {
    const { client } = clientAnswering({});
    vi.mocked(createClient).mockResolvedValue(client as never);
    const res = await respondBookingAction({
      locale: "lt",
      bookingId: "b-1",
      decision: "accepted",
      acknowledgeClash: true,
    });
    expect(res).toEqual({ kind: "needs-migration" });
  });

  it("the chat dispatcher gets its own code for it", () => {
    expect(mapKind("overlap-not-recordable")).toBe("overlap_not_recordable");
    expect(mapKind("conflict")).toBe("conflict");
  });
});
