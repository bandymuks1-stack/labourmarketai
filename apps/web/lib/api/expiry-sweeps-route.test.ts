import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/api/cron-auth", () => ({
  authorizeCronRequest: (req: Request) =>
    req.headers.get("authorization") === "Bearer secret" ? "ok" : "unauthorized",
}));

import { GET } from "@/app/api/cron/expiry-sweeps/route";

const authed = () => new Request("http://x/api/cron/expiry-sweeps", { headers: { authorization: "Bearer secret" } });

describe("GET /api/cron/expiry-sweeps", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it("refuses an unauthenticated caller and touches nothing", async () => {
    const res = await GET(new Request("http://x/api/cron/expiry-sweeps"));
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("runs nothing while the actor profile is not configured", async () => {
    vi.stubEnv("EXPIRY_SWEEP_ACTOR_PROFILE_ID", "");
    const res = await GET(authed());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: "actor_not_configured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports not_available (no 500) while the migration is unapplied", async () => {
    vi.stubEnv("EXPIRY_SWEEP_ACTOR_PROFILE_ID", "00000000-0000-0000-0000-000000000001");
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
    const res = await GET(authed());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not_available", step: "booking" });
  });

  it("returns counts only on success", async () => {
    vi.stubEnv("EXPIRY_SWEEP_ACTOR_PROFILE_ID", "00000000-0000-0000-0000-000000000001");
    rpc.mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce({ data: { ok: true, expired_count: 1 }, error: null });
    const res = await GET(authed());
    expect(await res.json()).toEqual({ ok: true, bookingExpired: 2, disclosureExpired: 1 });
    expect(rpc).toHaveBeenCalledWith("sweep_expire_stale_booking_requests_v1", expect.objectContaining({ p_stale_days: 14 }));
  });
});
