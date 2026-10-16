import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activationTokenMatches, LIVE_ACTIVATION_TOKEN } from "@/lib/billing/config-core";

/**
 * Live charging needs TWO independent owner acts (MKT-7; audit 2026-10-16 B-1).
 *
 * Act one: the env token (compared in constant time). Act two: the owner-only
 * database flag `lmc_settings.live_payments_enabled`, which gates the one
 * consequential live action — opening a new live Checkout Session — and
 * fails closed when unreadable. The webhook and the portal are NOT gated by
 * act two: what Stripe already did must still be recorded and honoured.
 */
describe("act one — constant-time token comparison", () => {
  it("accepts exactly the recorded decision", () => {
    expect(activationTokenMatches(LIVE_ACTIVATION_TOKEN)).toBe(true);
  });
  it("refuses prefixes, suffixes, case changes, empty and undefined", () => {
    for (const bad of ["approved-by-owne", "approved-by-owner ", "Approved-by-owner", "", "x"]) {
      expect(activationTokenMatches(bad), bad).toBe(false);
    }
    expect(activationTokenMatches(undefined)).toBe(false);
  });
});

describe("act two — the database flag gates new live checkouts only", () => {
  const web = join(__dirname, "../..");
  const route = readFileSync(join(web, "app/api/billing/test-checkout/route.ts"), "utf8");
  const flag = readFileSync(join(web, "lib/commercial/live-payments-flag.ts"), "utf8");

  it("the checkout route refuses a live session unless the flag reads enabled", () => {
    expect(route).toContain('if (config.state === "stripe_live") {');
    expect(route).toMatch(/const flag = await readLivePaymentsEnabled\(\);\s*if \(flag\.kind !== "enabled"\)/);
    expect(route).toContain('reason: "live_not_enabled"');
    // the check precedes session creation and the operation identity
    expect(route.indexOf("readLivePaymentsEnabled()")).toBeLessThan(route.indexOf("openCheckoutOperation("));
    expect(route.indexOf("readLivePaymentsEnabled()")).toBeLessThan(route.indexOf("createCheckoutSession("));
  });

  it("the flag read is server-only, owner-only by policy, and fails closed", () => {
    expect(flag).toContain('import "server-only";');
    expect(flag).toContain('.eq("key", "live_payments_enabled")');
    expect(flag).toMatch(/if \(error\) return \{ kind: "unavailable" \};/);
    expect(flag).toMatch(/catch \{\s*return \{ kind: "unavailable" \};/);
    expect(flag).toContain('data?.enabled === true ? { kind: "enabled" } : { kind: "disabled" }');
  });

  it("the webhook and the portal are not gated by act two (paid customers are honoured)", () => {
    const webhook = readFileSync(join(web, "app/api/billing/webhook/route.ts"), "utf8");
    const portal = readFileSync(join(web, "app/api/billing/portal/route.ts"), "utf8");
    expect(webhook).not.toContain("readLivePaymentsEnabled");
    expect(portal).not.toContain("readLivePaymentsEnabled");
  });

  it("the live_payments_enabled flag stays owner-only and false in code", () => {
    const flags = readFileSync(join(web, "lib/billing/lmc-flags.ts"), "utf8");
    expect(flags).toContain('live_payments_enabled: "owner_only"');
    expect(flags).toContain("export const LIVE_PAYMENTS_ENABLED = false as const;");
  });
});
