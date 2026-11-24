/**
 * Admin readiness overview — payments production calm v1 (2026-09-22).
 *
 * MEASURED defect: `paymentsEnabled` on the readiness control centre came
 * from the static `PAYMENTS_ENABLED` constant in plans.ts — a code pin that
 * never leaves `false` (guarded) — so the tile reported "off" while Stripe
 * was live. It now reads the RESOLVED server billing config, the same truth
 * the admin billing overview reports.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  config: { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" },
  admin: false,
}));

vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => state.config }));
vi.mock("@/lib/auth/superadmin", () => ({ isSuperadmin: vi.fn(async () => state.admin) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select() { return b; },
        eq() { return b; },
        in() { return b; },
        limit() { return b; },
        then(ok: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null, count: 0 }).then(ok); },
      };
      return b;
    },
  })),
}));

import { getAdminReadinessOverview } from "./readiness-overview";

beforeEach(() => {
  state.admin = false;
  state.config = { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" };
});

describe("paymentsEnabled reports the resolved billing config", () => {
  it("live adapter → true (the static constant would have said false)", async () => {
    const o = await getAdminReadinessOverview();
    expect(o.paymentsEnabled).toBe(true);
  });

  it("disabled adapter → false", async () => {
    state.config = { state: "disabled", reason: "payments_disabled", testMode: true, paymentsEnabled: false, mode: "test" };
    const o = await getAdminReadinessOverview();
    expect(o.paymentsEnabled).toBe(false);
  });

  it("the same answer for an admin (the live-table reads never overwrite it)", async () => {
    state.admin = true;
    const o = await getAdminReadinessOverview();
    expect(o.isAdmin).toBe(true);
    expect(o.paymentsEnabled).toBe(true);
  });

  it("source: reads getBillingConfig().paymentsEnabled, not PAYMENTS_ENABLED", () => {
    const src = readFileSync(join(__dirname, "readiness-overview.ts"), "utf8");
    expect(src).toMatch(/paymentsEnabled: getBillingConfig\(\)\.paymentsEnabled/);
    expect(src).not.toMatch(/paymentsEnabled: PAYMENTS_ENABLED/);
    expect(src).not.toMatch(/import \{[^}]*\bPAYMENTS_ENABLED\b[^}]*\} from "@\/lib\/billing\/plans"/);
  });
});
