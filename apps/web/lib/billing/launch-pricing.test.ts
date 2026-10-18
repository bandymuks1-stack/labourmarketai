import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decideOpenNeedsGate } from "./open-needs-gate";
import { limitFor, planIncludes } from "./entitlements";
import { resolveEntitlements, entitlementAllows } from "./entitlements-v1";
import {
  DEFERRED_PLAN_KEYS,
  FREE_ORGANIZATION_PLAN_KEY,
  ORGANIZATION_PLAN_KEY,
  PRE_PAYMENT_PLANS,
  defaultPlanFor,
  getPlan,
  isSellablePlan,
} from "./plans";
import { PRICING_READINESS_STATE } from "./readiness";

/**
 * OWNER LAUNCH PRICING (approved 2026-09-05, corrected the same day):
 *   PERSON €0 · ORGANIZATION FREE €0 (1 active position) · ORGANIZATION
 *   €99/month (NO fixed limit on active positions - owner decision
 *   2026-10-06; the former ten-position ceiling is removed and replaced by no
 *   other cap). One organization subscription for
 *   every capability. Deferred: ai_plus, vip_media, agency tiers, LMC
 *   top-ups, visibility / media / annual / enterprise / institution pricing.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;

describe("the registry IS the approved launch table (limits, not figures)", () => {
  it("PERSON stays free: the person's free plan is unchanged and no person plan is sellable", () => {
    const free = getPlan("free_worker")!;
    expect(free.accessState).toBe("free");
    for (const key of ["worker_profile", "worker_journal", "worker_basic_skills"] as const) expect(planIncludes(free, key)).toBe(true);
    expect(PRE_PAYMENT_PLANS.filter((p) => p.audience === "worker" && isSellablePlan(p))).toEqual([]);
    expect(defaultPlanFor("worker").slug).toBe("free_worker");
  });

  it("ORGANIZATION FREE: a real free plan, 1 active position, every organization capability", () => {
    const p = getPlan(FREE_ORGANIZATION_PLAN_KEY)!;
    expect(p.accessState).toBe("free");
    expect(limitFor(p, "company_create_needs")).toBe(1);
    for (const key of ["booking_requests", "communication", "team_matching", "agency_multi_company", "worker_pool", "doc_readiness_tracking", "booking_pipeline"] as const) {
      expect(planIncludes(p, key), key).toBe(true);
    }
    expect(defaultPlanFor("company").slug).toBe(FREE_ORGANIZATION_PLAN_KEY);
    expect(defaultPlanFor("agency").slug).toBe(FREE_ORGANIZATION_PLAN_KEY); // no role tunnel
  });

  it("ORGANIZATION (€99): the ONE sellable plan, NO numeric active-position limit, the same capabilities; the figure is NOT here", () => {
    const p = getPlan(ORGANIZATION_PLAN_KEY)!;
    expect(isSellablePlan(p)).toBe(true);
    // included (boolean true) and deliberately unmetered: no numeric ceiling
    expect(limitFor(p, "company_create_needs")).toBeNull();
    expect(planIncludes(p, "company_create_needs")).toBe(true);
    expect(read("lib/billing/plans.ts")).not.toMatch(/OPEN_NEEDS_CONTACT_THRESHOLD/);
    expect(PRE_PAYMENT_PLANS.filter(isSellablePlan).map((x) => x.slug)).toEqual([ORGANIZATION_PLAN_KEY]);
    expect(/99/.test(read("lib/billing/plans.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""))).toBe(false);
  });

  it("deferred plans exist for history but are never sellable", () => {
    expect([...DEFERRED_PLAN_KEYS]).toEqual(["worker_plus", "agency_pilot"]);
    for (const k of DEFERRED_PLAN_KEYS) expect(isSellablePlan(getPlan(k)!), k).toBe(false);
  });

  it("the price table is owner-confirmed and the figure lives only in plans.price_eur_monthly", () => {
    expect(PRICING_READINESS_STATE).toBe("owner_confirmed");
    expect(read("lib/marketing/plans.ts")).toMatch(/price_eur_monthly/);
    expect(read("components/marketing/pricing-table.tsx")).toMatch(/row\.price_eur_monthly/);
  });
});

describe("cancellation / subscription state → access (enforced)", () => {
  const base = { billingActive: true, isAdmin: false, audience: "company" as const, subscriptionPlanKey: null, subscriptionStatus: null, manualOverridePlanKey: null };
  it("active → unmetered; past_due (grace) → still unmetered; cancelled / unpaid / none → FREE (1)", () => {
    const limit = (c: ReturnType<typeof resolveEntitlements>) => limitFor(getPlan(c.effectivePlanKey)!, "company_create_needs");
    expect(limit(resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "active" }))).toBeNull();
    expect(limit(resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "past_due" }))).toBeNull();
    expect(limit(resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "cancelled" }))).toBe(1);
    expect(limit(resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "unpaid" }))).toBe(1);
    expect(limit(resolveEntitlements(base))).toBe(1);
    // the capability itself is not what the subscription buys — the ceiling is
    expect(entitlementAllows(resolveEntitlements(base), "company_create_needs")).toBe(true);
  });
});

describe("the open-needs gate — pure decision", () => {
  it("permissive while billing is disabled (pilot preserved)", () => {
    expect(decideOpenNeedsGate({ enforced: false, planKey: FREE_ORGANIZATION_PLAN_KEY, limit: 1, used: 7 })).toMatchObject({ allowed: true, enforced: false });
  });
  it("FREE: the 2nd active need is refused and the way forward is the €99 plan", () => {
    expect(decideOpenNeedsGate({ enforced: true, planKey: FREE_ORGANIZATION_PLAN_KEY, limit: 1, used: 0 })).toMatchObject({ allowed: true });
    expect(decideOpenNeedsGate({ enforced: true, planKey: FREE_ORGANIZATION_PLAN_KEY, limit: 1, used: 1 })).toMatchObject({ allowed: false, reason: "over_open_need_limit", limit: 1, used: 1, next: "upgrade" });
  });
  it("ORGANIZATION: NO numeric ceiling — any number of active needs is allowed, no replacement cap, no individual-plan step", () => {
    for (const used of [0, 9, 10, 11, 250]) {
      expect(decideOpenNeedsGate({ enforced: true, planKey: ORGANIZATION_PLAN_KEY, limit: null, used })).toMatchObject({ allowed: true, enforced: true, limit: null });
    }
  });
  it("an unreadable count fails CLOSED once enforced for a metered (FREE) plan — but cannot block an unmetered plan", () => {
    expect(decideOpenNeedsGate({ enforced: true, planKey: FREE_ORGANIZATION_PLAN_KEY, limit: 1, used: null })).toMatchObject({ allowed: false });
    expect(decideOpenNeedsGate({ enforced: true, planKey: ORGANIZATION_PLAN_KEY, limit: null, used: null })).toMatchObject({ allowed: true });
  });
});

describe("one canonical path, honest surfaces (source pins)", () => {
  it("the ONE demand creation path calls the gate before the RPC, counts under RLS, and the seam is the documented hasFeature", () => {
    const D = read("lib/demand/demand-request.ts");
    expect(D.indexOf("gateOpenNeeds(supabase, employer.organizationId, caller.userId)")).toBeLessThan(D.indexOf('.rpc('));
    expect(D).toMatch(/code: "over_open_need_limit", limit: needsGate\.limit, used: needsGate\.used, next: needsGate\.next/);
    const G = read("lib/billing/open-needs-gate.ts");
    expect(G).toContain('entitlementAllows(ctx, "company_create_needs")');
    // The entitlement subject is the gate's OWN caller, never the cookie
    // session a bearer (MCP) request lacks (production defect 2026-09-30).
    expect(G).toContain("getEffectiveEntitlements({ supabase, userId: profileId, organizationId })");
    expect(G).toMatch(/\.from\("customer_requests"\)/);
    expect(G).toMatch(/\.in\("status", \[\.\.\.ACTIVE_OPEN_NEED_STATUSES\]\)/);
    // A NEED IS A NEED. The ceiling is "open needs", so the count is scoped to
    // the DEMAND direction through the shared closed allow-list — an agency's
    // `agency_offer` is capacity it HAS, and it used to consume the employer's
    // allowance (measured as a hard production block, 2026-09-06: a FREE
    // organisation with one open need could not state its capacity at all).
    // The filter must come from `market-direction`, never be re-listed here,
    // so the gate and every read surface can never disagree about a kind.
    expect(G).toMatch(/\.or\(DEMAND_KIND_OR_FILTER\)/);
    expect(G).toMatch(/from "@\/lib\/demand\/market-direction"/);
    expect(G).not.toMatch(/kind\.eq\.company_request/);
    expect(G).not.toMatch(/createAdminClient|service_role|\.insert\(|\.update\(/);
    expect(read("lib/billing/readiness.ts")).toMatch(/company_create_needs: \{[\s\S]*?kind: "server_gate",[\s\S]*?site: "lib\/billing\/open-needs-gate\.ts"/);
  });

  it("reopening a closed need is an active need again — the SAME gate, the same honest answer (chat executor + visual controls); the external-client capability names it too", () => {
    const L = read("lib/demand/demand-lifecycle.ts");
    expect(L.indexOf("gateOpenNeeds(supabase, organizationId, user.id)")).toBeGreaterThan(L.indexOf("export async function reopenDemand"));
    expect(L).toMatch(/if \(!needsGate\.allowed\) return \{ kind: "over-limit", limit: needsGate\.limit, next: needsGate\.next \};/);
    expect(L).toMatch(/\| \{ kind: "over-limit"; limit: number; next: "upgrade" \| "individual_plan" \}/);
    expect(read("lib/conversation/company-executors.ts")).toMatch(/if \(r\.kind === "over-limit"\) \{/);
    const CTRL = read("components/app/demand-lifecycle-controls.tsx");
    expect(CTRL).toMatch(/if \(r\.kind === "over-limit"\) \{/);
    expect(CTRL).toMatch(/data-testid="demand-reopen-limit"/);
    expect(read("lib/capabilities/registry.ts")).toMatch(/result\.code === "over_open_need_limit"/);
    for (const loc of LOCALES) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      expect(typeof m.scouting.lifecycle.limitIndividual, loc).toBe("string");
    }
  });

  it("the chat and the visual form both say the honest next step (upgrade / individual plan); nothing charges", () => {
    const EXEC = read("lib/conversation/company-executors.ts");
    expect(EXEC).toMatch(/r\.next === "individual_plan" \? "over_open_need_limit_individual" : "over_open_need_limit_upgrade"/);
    expect(read("components/app/conversation/inline-action-form.tsx")).toMatch(/errorOpenNeedLimitIndividual/);
    const BTN = read("components/app/demand-request-button.tsx");
    expect(BTN).toMatch(/res\.code === "over_open_need_limit"/);
    expect(BTN).toMatch(/data-testid="demand-open-need-limit"/);
    for (const loc of LOCALES) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      expect(typeof m.conversation.forms.ui.errorOpenNeedLimitUpgrade, loc).toBe("string");
      expect(typeof m.conversation.forms.ui.errorOpenNeedLimitIndividual, loc).toBe("string");
      expect(typeof m.auth.dashboard.wow.demand.errorOpenNeedLimitIndividual, loc).toBe("string");
      expect(m.pricing.plans.free.features[0], loc).toMatch(/1 /);
      // the Organization plan has NO numeric limit (owner 2026-10-06): its first bullet must not pin a number
      expect(m.pricing.plans.business.features[0], loc).not.toMatch(/\b10\b/);
      expect(typeof m.pricing.individual.cta, loc).toBe("string");
      expect(m.pricing.pricePerMonth, loc).toContain("{price}");
    }
  });

  it("checkout: only the sellable plan, from the organization account, bound to the organization; the public page never sells directly", () => {
    const C = read("lib/billing/checkout-core.ts");
    expect(C).toMatch(/if \(!isSellablePlan\(plan\)\) \{\s*return \{ ok: false, status: 400, reason: "plan_deferred" \};/);
    const A = read("components/app/account-billing-section.tsx");
    expect(A).toMatch(/subject\.subject\?\.type === "organization" && subject\.billingAuthority/);
    expect(A).toMatch(/planKey=\{ORGANIZATION_PLAN_KEY\}/);
    const T = read("components/marketing/pricing-table.tsx");
    expect(T).toMatch(/href="\/dashboard\/account"/);
    expect(T).not.toMatch(/TestCheckoutButton|BillingTestCheckout/);
    expect(T).toMatch(/href="\/company-need"/);
    expect(read("lib/marketing/plans.ts")).toMatch(/PLAN_SLUGS = \["free", "business"\] as const/);
  });
});


describe("pricing hero ctaNext (guard named by create-cv-acquisition-intent)", () => {
  it("only promises /dashboard/account, and only when online activation is open", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "app", "[locale]", "(marketing)", "pricing", "page.tsx"),
      "utf8",
    );
    const matches = src.match(/ctaNext=\{[^}]*\}/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(matches[0]).toContain("activationOpen");
    expect(matches[0]).toContain("/dashboard/account");
  });
});
