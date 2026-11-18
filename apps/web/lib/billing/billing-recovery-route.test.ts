import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/billing/billing-recovery", () => ({ runBillingRecovery: vi.fn() }));
import { runBillingRecovery } from "@/lib/billing/billing-recovery";
import { GET } from "@/app/api/cron/billing-recovery/route";

const run = vi.mocked(runBillingRecovery);
const req = (auth?: string) =>
  new Request("http://localhost/api/cron/billing-recovery", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/billing-recovery", () => {
  const prev = process.env.CRON_SECRET;
  const prevFlag = process.env.BILLING_RECOVERY_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "s3cret-for-test";
    process.env.BILLING_RECOVERY_ENABLED = "true";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
    if (prevFlag === undefined) delete process.env.BILLING_RECOVERY_ENABLED;
    else process.env.BILLING_RECOVERY_ENABLED = prevFlag;
  });

  it("OPTION B: a valid CRON_SECRET with the recovery flag unset is refused and runs nothing", async () => {
    delete process.env.BILLING_RECOVERY_ENABLED;
    const res = await GET(req("Bearer s3cret-for-test"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "recovery_disabled" });
    expect(run).not.toHaveBeenCalled();
  });

  it("auth is still checked first: wrong secret with the flag on is 401", async () => {
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed while CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req("Bearer anything"));
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("not_configured");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("503 + reason when billing is unavailable", async () => {
    run.mockResolvedValue({ kind: "unavailable", reason: "billing_inactive" });
    const res = await GET(req("Bearer s3cret-for-test"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "billing_inactive" });
  });

  it("200 with counts only on success", async () => {
    run.mockResolvedValue({
      kind: "ok",
      mode: "test",
      selected: 2,
      processed: 2,
      skippedBudget: 0,
      counts: { applied: 2 },
      recoverableSubscriptionStateDrift: 2,
      unmappableUnprocessedWebhookEvents: 0,
      unmappableRepaired: 0,
    });
    const res = await GET(req("Bearer s3cret-for-test"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, processed: 2, counts: { applied: 2 } });
  });
});
