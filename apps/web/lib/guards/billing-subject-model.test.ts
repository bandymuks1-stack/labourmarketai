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

  // Payments production calm v1 (2026-09-22). Two MEASURED defects re-pinned
  // as invariants:
  //   (a) every subscription read carries the adapter MODE — admission and the
  //       customer lookup already did; a test_mode=true row (the column's
  //       default) must never entitle a live workspace or vice versa;
  //   (b) the ORGANIZATION read goes through the service-role client scoped by
  //       the SERVER-resolved subject: the table's only SELECT policy is
  //       owner-or-admin, so the user client showed an organization's plan to
  //       the purchaser alone (a co-manager with manage-billing got free).
  //       Personal subjects keep the user-scoped read (owner_id = auth.uid()
  //       IS the policy). No RLS migration.
  it("every subscription read is scoped to the adapter mode (test_mode = config.testMode)", () => {
    // code lines only (the explanatory comment names the filter too)
    const reads = ent.match(/^\s*\.from\("billing_subscriptions"\)/gm) ?? [];
    const modeFilters = ent.match(/^\s*\.eq\("test_mode", config\.testMode\)/gm) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(modeFilters.length).toBe(reads.length);
  });

  it("the organization read uses the service-role client scoped by the server-resolved subject; personal stays user-scoped", () => {
    expect(ent).toMatch(/import \{ createAdminClient \} from "@\/lib\/supabase\/admin"/);
    // the admin reader is created ONLY inside the organization branch …
    const orgBranch = ent.slice(
      ent.indexOf('if (subject && subject.type === "organization")'),
      ent.indexOf("} else {"),
    );
    expect(orgBranch).toMatch(/createAdminClient\(\)/);
    expect(orgBranch).toMatch(/\.eq\("organization_id", subject\.id\)/);
    // … and the personal branch never touches it
    const personalBranch = ent.slice(ent.indexOf("} else {"), ent.indexOf("const { data: subs, error }"));
    expect(personalBranch).not.toMatch(/createAdminClient/);
    expect(personalBranch).toMatch(/\.eq\("owner_id", user\.id\)/);
    // the subject id is the server resolution, never a request value
    expect(ent).toMatch(/const billing = await resolveBillingSubject\(\)/);
    expect(ent).not.toMatch(/searchParams|formData|request\.json|cookies\(/);
    // a missing service key degrades to the user client instead of throwing
    expect(orgBranch).toMatch(/catch \{[\s\S]*?reader = supabase;/);
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
