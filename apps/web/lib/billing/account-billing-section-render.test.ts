/**
 * Account billing section — RENDER proof for payments production calm v1
 * (2026-09-22). The real async server component, rendered to static markup
 * with the REAL message catalogs and every server collaborator mocked.
 *
 * MEASURED defect: after a paid return (`?billing=success|test_success`)
 * with no `billing_subscriptions` row yet (the webhook still in flight) the
 * section said "No subscription" and offered the Order button AGAIN. Now it
 * withholds the button and says the state is syncing — in every active
 * locale — and returns to the normal offer once the flag is gone or a row
 * exists. Also pinned: the success notice follows the ADAPTER MODE (a live
 * purchase never reads "test-mode … no real money moved").
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

const state = vi.hoisted(() => ({
  locale: "en",
  config: { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" },
  ent: {
    effectivePlanKey: "free_organization",
    source: "free",
    subscriptionStatus: null as string | null,
    active: false,
    grace: false,
    enforced: true,
    profileId: "member-2",
  },
  subject: {
    subject: { type: "organization", id: "org-1" },
    payerProfileId: "member-2",
    billingAuthority: true,
    role: "owner",
  },
}));

const WEB = join(__dirname, "..", "..");
const catalogs: Record<string, Record<string, unknown>> = {};
const catalog = (loc: string) =>
  (catalogs[loc] ??= JSON.parse(readFileSync(join(WEB, "messages", `${loc}.json`), "utf8")));

/** A `getTranslations`-shaped translator over the REAL catalog subtree; a
 *  missing key renders a VISIBLE marker so the assertions catch it. */
function scoped(loc: string, ns: string) {
  const root = catalog(loc)[ns] as Record<string, unknown>;
  return (key: string) => {
    const v = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], root);
    return typeof v === "string" ? v : `MISSING:${ns}.${key}`;
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (ns: string) => scoped(state.locale, ns)),
}));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => state.config }));
vi.mock("@/lib/billing/effective-entitlements", () => ({
  getEffectiveEntitlements: vi.fn(async () => state.ent),
}));
vi.mock("@/lib/billing/customer-store", () => ({
  findBillingCustomer: vi.fn(async () => ({ status: "absent" })),
}));
vi.mock("@/lib/billing/billing-subject", () => ({
  resolveBillingSubject: vi.fn(async () => state.subject),
}));

import { AccountBillingSection } from "@/components/app/account-billing-section";

async function render(billingReturn: string | null): Promise<string> {
  const el = await AccountBillingSection({ billingReturn });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  state.locale = "en";
  state.config = { state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" };
  state.ent = { ...state.ent, source: "free", subscriptionStatus: null, effectivePlanKey: "free_organization" };
  state.subject = { ...state.subject, billingAuthority: true };
});

describe("the paid return with no row yet", () => {
  it("withholds the Order button and shows the syncing notice — never 'No subscription' + a second Order", async () => {
    for (const flag of ["success", "test_success"]) {
      const html = await render(flag);
      expect(html, flag).toContain('data-testid="account-billing-syncing"');
      expect(html, flag).not.toContain('data-testid="account-billing-order"');
      expect(html, flag).not.toContain(catalog("en").accountBilling!["none" as never]);
      expect(html, flag).not.toContain("MISSING:");
    }
  });

  it("renders the syncing sentence from the REAL catalog in every active locale (no raw key, no [EN] shell)", async () => {
    for (const loc of activeLocales) {
      state.locale = loc;
      const html = await render("success");
      const expected = (catalog(loc).accountBilling as { returned: { syncing: string } }).returned.syncing;
      expect(expected, loc).toBeTruthy();
      expect(expected, loc).not.toMatch(/^\[EN\]/);
      expect(html, loc).toContain(expected.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
      expect(html, loc).not.toContain("MISSING:");
    }
  });
});

describe("the calm baseline stays", () => {
  it("no return flag → the normal offer: 'No subscription' + the Order button, no syncing notice", async () => {
    const html = await render(null);
    expect(html).toContain('data-testid="account-billing-order"');
    expect(html).not.toContain('data-testid="account-billing-syncing"');
  });

  it("a cancelled return (live or test) keeps the Order button — nothing was bought", async () => {
    for (const flag of ["cancelled", "test_cancelled"]) {
      const html = await render(flag);
      expect(html, flag).toContain('data-testid="account-billing-order"');
      expect(html, flag).not.toContain('data-testid="account-billing-syncing"');
      expect(html, flag).toContain('data-return="' + flag + '"');
    }
  });

  it("once the row exists (subscription source) the plan renders and neither the Order button nor the syncing notice does", async () => {
    state.ent = { ...state.ent, source: "subscription", subscriptionStatus: "active", effectivePlanKey: "company_pilot", active: true };
    const html = await render("success");
    expect(html).toContain('data-testid="account-billing-plan"');
    expect(html).not.toContain('data-testid="account-billing-order"');
    expect(html).not.toContain('data-testid="account-billing-syncing"');
  });

  it("an incomplete row is the route's own refusal, not a sync wait: no Order button, no syncing notice", async () => {
    state.ent = { ...state.ent, source: "free", subscriptionStatus: "incomplete" };
    const html = await render("success");
    expect(html).not.toContain('data-testid="account-billing-order"');
    expect(html).not.toContain('data-testid="account-billing-syncing"');
  });
});

describe("the success notice follows the adapter mode", () => {
  it("live: the live sentence, never 'test-mode … no real money moved'", async () => {
    const html = await render("success");
    const en = catalog("en").accountBilling as { returned: { success: string; successLive: string } };
    expect(html).toContain(en.returned.successLive.replace(/'/g, "&#x27;"));
    expect(html).not.toContain("No real money moved");
  });

  it("test: the test-mode sentence + the TEST badge", async () => {
    state.config = { state: "stripe_test", reason: "ok", testMode: true, paymentsEnabled: true, mode: "test" };
    const html = await render("test_success");
    expect(html).toContain("No real money moved");
    expect(html).toContain("Test mode");
  });
});
