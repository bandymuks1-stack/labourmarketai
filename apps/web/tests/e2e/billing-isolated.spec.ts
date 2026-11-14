import { expect, test, type Page } from "@playwright/test";
import Stripe from "stripe";

import { BASE, isolatedStack, lit, onboard, publishNeed, setUpCompany, signUp, sql, submitNeed, userId } from "./isolated-web-a-helpers";

/**
 * PLAN ACCESS ON THE ISOLATED STACK — FREE, trial, paid, after the end
 * (owner scenarios 10–13, 2026-11-12), in .github/workflows/billing-isolated.yml.
 *
 * Production is never involved: the app and Supabase run on 127.0.0.1 on a
 * throwaway runner, production hosts resolve to nowhere, and the job holds NO
 * Stripe credential. Billing is armed in TEST state with placeholder,
 * test-shaped values that open nothing at Stripe.
 *
 * WHAT IS REAL: the browser, the app, its server actions and the one need
 * gate, the local database, and the webhook route with its real signature
 * verification (the events below are signed with the job's own webhook
 * secret, exactly as Stripe signs a delivery).
 * WHAT IS NOT WALKED HERE: Stripe's hosted Checkout and Customer Portal pages
 * and Stripe's own delivery of the events. Those need a Stripe TEST account
 * and stay BLOCKED BY PRECONDITION until the owner provides one; this walk
 * does not claim them.
 *
 * The proof of every step is the stored row or the server's refusal, read
 * after the fact — never the page saying "done".
 */
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const ENABLED = isolatedStack() && process.env.BILLING_ISOLATED === "1" && /^whsec_/.test(WHSEC);
test.skip(!ENABLED, "isolated billing stack only (BILLING_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const OWNER = `billing.owner.${RUN}@local.test`;
const PLAN_KEY = "company_pilot";
const SUBSCRIPTION = `sub_test_isolated_${RUN}`;
const ACTIVE = "('submitted','in_review','needs_followup','approved')";
/** Signing only — the SDK never opens a connection in this file. */
const signer = new Stripe("sk_test_isolated_signing_only");

const ids = { owner: "", org: "" };
let clock = Math.floor(Date.now() / 1000);
let page: Page;

function activeNeeds(): number {
  return sql<{ n: number }>(
    `select count(*)::int as n from public.customer_requests
      where status in ${ACTIVE} and (organization_id = ${lit(ids.org)} or (organization_id is null and profile_id = ${lit(ids.owner)}))`,
  )[0].n;
}

function subscriptionRow(): { status: string; test_mode: boolean; plan_key: string } | undefined {
  return sql<{ status: string; test_mode: boolean; plan_key: string }>(
    `select status, test_mode, plan_key from public.billing_subscriptions where organization_id = ${lit(ids.org)}`,
  )[0];
}

/** One signed `customer.subscription.*` delivery to the LOCAL webhook route. */
async function deliver(type: string, status: string, periodDays: number): Promise<void> {
  clock += 10;
  const metadata = {
    plan_key: PLAN_KEY, canonical_plan_key: PLAN_KEY, owner_id: ids.owner, client_reference_id: ids.owner,
    organization_id: ids.org, environment: "test", test_mode: "true",
  };
  const body = JSON.stringify({
    id: `evt_test_isolated_${RUN}_${clock}`, object: "event", type, created: clock, livemode: false,
    data: {
      object: {
        id: SUBSCRIPTION, object: "subscription", livemode: false, customer: `cus_test_isolated_${RUN}`,
        status, cancel_at_period_end: false, metadata,
        items: { data: [{ id: "si_test_isolated", price: { id: "price_test_isolated", unit_amount: 9900, currency: "eur" }, current_period_start: clock, current_period_end: clock + periodDays * 86_400 }] },
      },
    },
  });
  const res = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signer.webhooks.generateTestHeaderString({ payload: body, secret: WHSEC }) },
    body,
  });
  expect(res.status, `${type} is accepted by the webhook route`).toBe(200);
  expect(await res.json(), `${type} is processed`).toMatchObject({ ok: true, processed: true });
}

async function billingView(): Promise<{ state: string | null; status: string | null }> {
  await page.goto(`${BASE}/en/dashboard/account`);
  const fold = page.getByTestId("account-plan-fold");
  await expect(fold).toBeVisible({ timeout: 30_000 });
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const section = page.getByTestId("account-billing-status");
  await expect(section).toBeVisible({ timeout: 30_000 });
  return { state: await section.getAttribute("data-billing-state"), status: await section.getAttribute("data-subscription-status") };
}

async function expectRefused(role: string): Promise<void> {
  const before = activeNeeds();
  // The intake's address ends in a #fragment: going to it from the same page
  // is a same-document navigation that keeps the form's "sent" state. Leave
  // the page first, so the person meets a fresh form.
  await page.goto(`${BASE}/en/dashboard/account`);
  await submitNeed(page, BASE, role, "LT");
  await expect(page.getByRole("main").getByTestId("demand-open-need-limit"), "the server refuses the need").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main").getByTestId("demand-done")).toHaveCount(0);
  expect(activeNeeds(), "nothing was stored by the refused attempt").toBe(before);
}

test("B-0. a new organization owner signs up; billing is armed in TEST state on this stack only", async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await signUp(page, BASE, OWNER);
  await onboard(page, "hire", `Synthetic Billing Owner ${RUN}`);
  await setUpCompany(page, `Synthetic Billing Co ${RUN}`);
  ids.owner = await userId(OWNER);
  const orgs = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(ids.owner)}`);
  expect(orgs.length, "the owner has exactly one organization").toBe(1);
  ids.org = orgs[0].id;
  const view = await billingView();
  expect(view.state, "this stack is in Stripe TEST state — never live").toBe("stripe_test");
  expect(subscriptionRow(), "a new organization holds no subscription").toBeUndefined();
});

test("S10. FREE: one need is accepted, the next is refused by the server", async () => {
  await publishNeed(page, BASE, `Billing need one ${RUN}`, "LT");
  expect(activeNeeds()).toBe(1);
  await expectRefused(`Billing need refused ${RUN}`);
  // A direct webhook without a valid signature changes nothing either.
  const forged = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=forged" }, body: "{}",
  });
  expect(forged.status, "an unsigned delivery is refused").toBe(400);
  expect(subscriptionRow()).toBeUndefined();
});

test("S12. TRIAL: a trialing subscription gives the paid plan for the set time — to this organization only", async () => {
  await deliver("customer.subscription.created", "trialing", 14);
  expect(subscriptionRow()).toMatchObject({ status: "trialing", test_mode: true, plan_key: PLAN_KEY });
  expect((await billingView()).status).toBe("trialing");
  await publishNeed(page, BASE, `Billing need two ${RUN}`, "LT");
  expect(activeNeeds(), "the FREE ceiling is lifted during the trial").toBe(2);
  // The trial belongs to one organization: no other organization got a row.
  const others = sql<{ n: number }>(
    `select count(*)::int as n from public.billing_subscriptions where organization_id is distinct from ${lit(ids.org)}`,
  )[0].n;
  expect(others, "no other organization received a subscription").toBe(0);
});

test("S11. PREMIUM: an active subscription keeps the plan with no need ceiling", async () => {
  await deliver("customer.subscription.updated", "active", 30);
  expect(subscriptionRow()).toMatchObject({ status: "active", test_mode: true });
  expect((await billingView()).status).toBe("active");
  await publishNeed(page, BASE, `Billing need three ${RUN}`, "LT");
  expect(activeNeeds()).toBe(3);
});

test("S13. AFTER THE END: the data stays, the subscription is history, and new needs are refused", async () => {
  await deliver("customer.subscription.deleted", "canceled", 30);
  expect(subscriptionRow(), "the row is kept as history, not deleted").toMatchObject({ status: "cancelled" });
  expect(activeNeeds(), "every need created under the plan is still there and still active").toBe(3);
  await expectRefused(`Billing need after end ${RUN}`);
  // A late 'active' event for the same subscription cannot revive it.
  clock += 10;
  await fetchLate();
  expect(subscriptionRow()).toMatchObject({ status: "cancelled" });
  await page.context().close();
});

/** A newer `active` event for the cancelled subscription: acknowledged, never applied. */
async function fetchLate(): Promise<void> {
  const body = JSON.stringify({
    id: `evt_test_isolated_${RUN}_late`, object: "event", type: "customer.subscription.updated", created: clock, livemode: false,
    data: { object: { id: SUBSCRIPTION, object: "subscription", livemode: false, customer: `cus_test_isolated_${RUN}`, status: "active", cancel_at_period_end: false,
      metadata: { plan_key: PLAN_KEY, canonical_plan_key: PLAN_KEY, owner_id: ids.owner, client_reference_id: ids.owner, organization_id: ids.org }, items: { data: [] } } },
  });
  const res = await fetch(`${BASE}/api/billing/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signer.webhooks.generateTestHeaderString({ payload: body, secret: WHSEC }) },
    body,
  });
  expect(res.status).toBe(200);
}
