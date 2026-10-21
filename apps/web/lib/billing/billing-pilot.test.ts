import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  billingConfigForSubject,
  parsePilotOrganizations,
  pilotAdmits,
  resolveBillingConfig,
} from "@/lib/billing/config-core";

const A = "11111111-2222-4333-8444-555555555555";
const B = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const testCfg = resolveBillingConfig({
  paymentsEnabled: "true",
  provider: "stripe",
  mode: "test",
  secretKey: "sk_test_x",
  webhookSecret: "whsec_x",
  publishableKey: "pk_test_x",
});
const offCfg = resolveBillingConfig({
  paymentsEnabled: "false",
  provider: "none",
  mode: "test",
  secretKey: undefined,
  webhookSecret: undefined,
  publishableKey: undefined,
});

describe("billing pilot list (owner 2026-10-21)", () => {
  it("unset or blank means no pilot: billing applies exactly as before", () => {
    expect(parsePilotOrganizations(undefined)).toBeNull();
    expect(parsePilotOrganizations("  ")).toBeNull();
    expect(billingConfigForSubject(testCfg, null, null)).toBe(testCfg);
    expect(billingConfigForSubject(testCfg, null, A)).toBe(testCfg);
  });

  it("a listed organization sees the active adapter; any other subject reads billing as off", () => {
    const pilot = parsePilotOrganizations(` ${A.toUpperCase()} `);
    expect(pilotAdmits(pilot, A)).toBe(true);
    expect(billingConfigForSubject(testCfg, pilot, A).state).toBe("stripe_test");
    for (const other of [B, null]) {
      const cfg = billingConfigForSubject(testCfg, pilot, other);
      expect(cfg.state).toBe("disabled");
      expect(cfg.paymentsEnabled).toBe(false);
      expect(cfg.testMode).toBe(false);
      expect(cfg.reason).toBe("not_in_pilot");
    }
  });

  it("a malformed list admits nobody — a typo never widens billing", () => {
    for (const raw of [`${A},not-a-uuid`, ",", "all", "*"]) {
      const pilot = parsePilotOrganizations(raw);
      expect(pilot).not.toBeNull();
      expect(pilotAdmits(pilot, A)).toBe(false);
    }
  });

  it("the pilot never turns billing ON: an inactive adapter stays as it is", () => {
    const pilot = parsePilotOrganizations(A);
    expect(billingConfigForSubject(offCfg, pilot, A)).toBe(offCfg);
  });

  it("every user-facing billing surface reads the pilot-aware config", () => {
    const root = join(__dirname, "..", "..");
    for (const rel of [
      "app/api/billing/test-checkout/route.ts",
      "lib/billing/effective-entitlements.ts",
      "components/app/account-billing-section.tsx",
      "app/[locale]/dashboard/account/page.tsx",
      "app/[locale]/(marketing)/pricing/page.tsx",
      "components/marketing/pricing-table.tsx",
      "components/marketing/billing-test-checkout.tsx",
      "components/marketing/concierge-offer.tsx",
      "app/llms.txt/route.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(src, rel).toMatch(/getBillingConfigFor\(/);
      expect(src, rel).not.toMatch(/getBillingConfig\(\)/);
    }
  });
});
