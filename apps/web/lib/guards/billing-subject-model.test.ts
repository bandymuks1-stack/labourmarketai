import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hasOrganizationCapability } from "@/lib/company/role-capabilities";

/**
 * M-P0-7 — canonical billing subject model (§13). Pinned:
 *
 *   1. billing authority = the `manage-billing` capability — owner/admin
 *      ONLY; membership alone (manager/external_manager/member) is never
 *      billing authority;
 *   2. the workspace proposes the subject, the capability decides authority
 *      (billing-subject.ts), and NO client field names a subject;
 *   3. NO ENTITLEMENT TRANSFER: the entitlement read is per-subject —
 *      an organization workspace queries organization rows only, personal
 *      queries personal rows only, both feature-detected (42703) so the
 *      unapplied schema degrades to exactly today's behaviour;
 *   4. this slice adds no provider calls and touches neither the Stripe
 *      live-block nor the LMC flags.
 */

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, ...p.split("/")), "utf8");

describe("§13 billing authority is a capability, never bare membership", () => {
  it("owner/admin hold manage-billing; operational and member roles do not", () => {
    expect(hasOrganizationCapability("owner", "manage-billing")).toBe(true);
    expect(hasOrganizationCapability("admin", "manage-billing")).toBe(true);
    expect(hasOrganizationCapability("manager", "manage-billing")).toBe(false);
    expect(hasOrganizationCapability("external_manager", "manage-billing")).toBe(false);
    expect(hasOrganizationCapability("member", "manage-billing")).toBe(false);
  });
});

describe("§13 subject resolver", () => {
  const subject = read("lib/billing/billing-subject.ts");

  it("workspace proposes; capability decides; payer is the signed-in profile", () => {
    expect(subject).toMatch(/resolveEmployerCompanyContext/);
    expect(subject).toMatch(/hasOrganizationCapability\(ctx\.role, "manage-billing"\)/);
    expect(subject).toMatch(/payerProfileId: user\.id/);
  });

  it("takes no client input and calls no provider", () => {
    expect(subject).not.toMatch(/formData|searchParams|request\.json|\.body\b/i);
    // provider seam untouched: no SDK import, no provider module import
    expect(subject).not.toMatch(/from "stripe"|getBillingProvider|providers\//);
  });
});

describe("§13 no entitlement transfer on workspace switch", () => {
  const ent = read("lib/billing/effective-entitlements.ts");

  it("organization subject reads organization rows only", () => {
    expect(ent).toMatch(/\.eq\("organization_id", subject\.id\)/);
  });

  it("personal subject excludes organization-born rows", () => {
    expect(ent).toMatch(/\.is\("origin_organization_id", null\)/);
  });

  it("both paths feature-detect the unapplied schema (42703)", () => {
    expect(ent).toMatch(/UNDEFINED_COLUMN = "42703"/);
    const detects = ent.match(/UNDEFINED_COLUMN\b/g);
    expect((detects?.length ?? 0)).toBeGreaterThanOrEqual(3);
  });
});

describe("§13 hard boundaries stay", () => {
  it("Stripe live remains unreachable (config core untouched by this slice)", () => {
    const core = read("lib/billing/config-core.ts");
    expect(core).toMatch(/stripe_live_blocked/);
  });

  it("all six LMC flags remain false consts", () => {
    const flags = read("lib/billing/lmc-flags.ts");
    const falses = flags.match(/= false as const/g);
    expect((falses?.length ?? 0)).toBeGreaterThanOrEqual(6);
  });

  it("PAYMENTS_ENABLED code pin remains false", () => {
    expect(read("lib/billing/plans.ts")).toMatch(/PAYMENTS_ENABLED = false as const/);
  });
});
