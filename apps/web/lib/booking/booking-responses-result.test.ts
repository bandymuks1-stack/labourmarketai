import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN is not ZERO for "workers answered your booking proposals" (SEP-7).
 * A failed seen-at or bookings read must not read as "no responses".
 */

const h = vi.hoisted(() => ({ user: vi.fn(), seen: vi.fn(), bookings: vi.fn() }));

function chain(result: () => Promise<unknown>) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "maybeSingle"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user() } }) },
    from: (table: string) => (table === "booking_requests_seen" ? chain(h.seen) : chain(h.bookings)),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import {
  getBookingResponsesNewCount,
  listMyBookings,
  listMyBookingsResult,
  readBookingResponsesNewCount,
} from "./booking-actions";

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

beforeEach(() => {
  h.user.mockReset().mockReturnValue({ id: "u1" });
  h.seen.mockReset().mockResolvedValue({ data: { seen_at: iso(86400000) }, error: null });
  h.bookings.mockReset().mockResolvedValue({ data: [], error: null });
});

describe("readBookingResponsesNewCount", () => {
  it("seen, nothing answered since -> ok 0 (the only 'no responses')", async () => {
    expect(await readBookingResponsesNewCount()).toEqual({ status: "ok", count: 0 });
  });

  it("never seen and no fallback -> ok 0: nothing can have been shown yet", async () => {
    h.seen.mockResolvedValue({ data: null, error: null });
    expect(await readBookingResponsesNewCount()).toEqual({ status: "ok", count: 0 });
  });

  it("an absent seen-at table is 'never seen', not a failure", async () => {
    h.seen.mockResolvedValue({ data: null, error: { code: "42P01" } });
    expect(await readBookingResponsesNewCount()).toEqual({ status: "ok", count: 0 });
  });

  it("a FAILED seen-at read is unavailable - not zero", async () => {
    h.seen.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await readBookingResponsesNewCount()).toEqual({ status: "unavailable" });
    h.seen.mockRejectedValue(new Error("network"));
    expect(await readBookingResponsesNewCount()).toEqual({ status: "unavailable" });
  });

  it("a FAILED bookings read is unavailable - not zero", async () => {
    h.bookings.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await readBookingResponsesNewCount()).toEqual({ status: "unavailable" });
  });

  it("an absent bookings table is ok 0 (nothing can be answered yet)", async () => {
    h.bookings.mockResolvedValue({ data: null, error: { code: "42P01" } });
    expect(await readBookingResponsesNewCount()).toEqual({ status: "ok", count: 0 });
  });

  it("signed out is unavailable (no caller to count for)", async () => {
    h.user.mockReturnValue(null);
    expect(await readBookingResponsesNewCount()).toEqual({ status: "unavailable" });
  });
});

describe("legacy readers keep their shape", () => {
  it("listMyBookings answers an empty list for a failed read; the Result reader says error", async () => {
    h.bookings.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect((await listMyBookingsResult()).kind).toBe("error");
    expect(await listMyBookings()).toEqual({ kind: "ok", incoming: [], outgoing: [] });
  });

  it("getBookingResponsesNewCount still answers a number (0 on any failure)", async () => {
    h.seen.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await getBookingResponsesNewCount()).toBe(0);
  });
});
