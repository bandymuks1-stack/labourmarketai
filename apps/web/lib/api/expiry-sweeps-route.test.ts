import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCronRequest: (req: Request) =>
    req.headers.get("authorization") === "Bearer secret" ? "ok" : "unauthorized",
}));

import { GET } from "@/app/api/cron/expiry-sweeps/route";

const authed = () =>
  new Request("http://x/api/cron/expiry-sweeps", { headers: { authorization: "Bearer secret" } });

describe("GET /api/cron/expiry-sweeps", () => {
  beforeEach(() => rpc.mockReset());

  it("refuses an unauthenticated caller and touches nothing", async () => {
    const res = await GET(new Request("http://x/api/cron/expiry-sweeps"));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes NO actor: the identity is the system's, never the caller's", async () => {
    rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: { ok: true, expired_count: 0 }, error: null });
    await GET(authed());
    expect(rpc).toHaveBeenNthCalledWith(1, "sweep_expire_stale_booking_requests_v1", { p_stale_days: 14 });
    expect(rpc).toHaveBeenNthCalledWith(2, "sweep_expire_contact_disclosure_requests_v1");
  });

  it("says actor_not_provisioned (503, nothing changed) until the system identity exists", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "system actor not provisioned" } });
    const res = await GET(authed());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: "actor_not_provisioned", step: "booking" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reports not_available (no 500) while the migration is unapplied", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the function public.sweep_expire_stale_booking_requests_v1" },
    });
    const res = await GET(authed());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not_available", step: "booking" });
  });

  it("returns counts only on success", async () => {
    rpc
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: { ok: true, expired_count: 1 }, error: null });
    const res = await GET(authed());
    expect(await res.json()).toEqual({ ok: true, bookingExpired: 2, disclosureExpired: 1 });
  });
});
