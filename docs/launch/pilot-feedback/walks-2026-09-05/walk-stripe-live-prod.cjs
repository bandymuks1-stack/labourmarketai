// Production acceptance — STRIPE LIVE + launch pricing (owner approval 2026-09-05). Two phases:
//  PHASE=before (after deploy, before the owner pays): /pricing shows €0 / €99 / "Need more?"; the E2E organization
//    owner's account shows the ORDER button; the checkout route mints a LIVE Stripe Checkout URL for the ORGANIZATION
//    plan (the walk STOPS at the URL — a card is never entered by the agent); FREE limit: the 2nd active need is refused
//    with the "upgrade" path (E2E Walker UAB has 1 or more active needs already — the walk reads the count first).
//  PHASE=after (after the owner's real payment): webhook rows, billing_subscriptions active for the organization,
//    account state, the paid organization can reach 10 and the 11th is refused with the individual-plan path (the walk
//    creates needs by the canonical form, then closes them), Customer Portal URL minted. Readback SQL printed at the end.
// No fabricated SQL state. Residue: needs created here are CLOSED by the walk (rows remain as closed, E2E project).
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const ORG = "a996113c-6155-4ca6-9bac-4fc7bf7db8ae";
const PHASE = process.env.PHASE || "before";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-stripe-live"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build, phase: PHASE });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: MANAGER }); if (error) throw error;
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: v } = await anon.auth.verifyOtp({ email: MANAGER, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
  const cookieValue = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: cookieValue, domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const t0 = Date.now();
  // 1. pricing — the DB figures, the individual card
  await p.goto("https://labourmarket.ai/lt/pricing", { waitUntil: "domcontentloaded", timeout: 60000 });
  const priceFree = await p.getByTestId("pricing-price-free").innerText().catch(() => null);
  const priceOrg = await p.getByTestId("pricing-price-business").innerText().catch(() => null);
  const individual = (await p.getByTestId("pricing-plan-individual").count()) > 0;
  log({ step: "pricing", priceFree, priceOrg, individual, cta: await p.getByTestId("pricing-cta-business").innerText().catch(() => null) });
  await p.screenshot({ path: path.join(OUT, `${PHASE}-01-pricing.png`), fullPage: true });
  // 2. the organization account — billing state + the order button
  await p.goto("https://labourmarket.ai/lt/dashboard/account", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("account-billing-status").waitFor({ timeout: 60000 });
  const billingState = await p.getByTestId("account-billing-status").getAttribute("data-billing-state");
  const subStatus = await p.getByTestId("account-billing-status").getAttribute("data-subscription-status");
  const orderBtn = p.getByTestId("test-checkout-company_pilot");
  log({ step: "account", billingState, subStatus, orderButton: (await orderBtn.count()) > 0, plan: await p.getByTestId("account-billing-plan").innerText().catch(() => null) });
  await p.screenshot({ path: path.join(OUT, `${PHASE}-02-account.png`) });
  if (PHASE === "before") {
    // 3. mint a LIVE Checkout session URL through the SAME route the button posts to — stop at the URL
    const res = await p.evaluate(async () => {
      const r = await fetch("/api/billing/test-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planKey: "company_pilot" }) });
      return { status: r.status, body: await r.json() };
    });
    log({ step: "checkout_session", status: res.status, ok: res.body.ok, reason: res.body.reason ?? null, urlHost: res.body.url ? new URL(res.body.url).host : null });
    // 4. FREE limit: the count and the 2nd need
    const { count } = await admin.from("customer_requests").select("id", { count: "exact", head: true }).eq("organization_id", ORG).in("status", ["submitted", "in_review", "needs_followup", "approved"]);
    log({ step: "free_limit_precondition", activeOpenNeeds: count });
  }
  // 5. the open-needs ceiling through the canonical chat form (both phases): submit one need; read the answer
  await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  const composer = p.getByTestId("composer-input");
  await composer.waitFor({ timeout: 90000 });
  const created = [];
  const attempts = PHASE === "after" ? 11 : 2;
  for (let i = 1; i <= attempts; i++) {
    await composer.fill(`reikia 2 pastolininkų Vilniuje nuo spalio ${i + 5} (E2E ribos testas ${i})`); await composer.press("Enter");
    const form = p.getByTestId("inline-action-form-company.create-demand");
    await form.waitFor({ timeout: 30000 });
    await p.getByTestId("inline-action-continue").click();
    await p.getByTestId("inline-action-review").waitFor({ timeout: 30000 });
    await p.getByTestId("inline-action-save").click();
    await p.waitForTimeout(6000);
    const err = await p.getByTestId("inline-action-error").last().innerText().catch(() => null);
    const done = (await p.getByTestId("inline-action-done").count()) > 0;
    log({ step: "need_attempt", i, saved: done && !err, error: err });
    if (err) { await p.screenshot({ path: path.join(OUT, `${PHASE}-03-limit-${i}.png`) }); break; }
    created.push(i);
  }
  // readback + cleanup: the needs created by this walk are CLOSED (canonical lifecycle status), never deleted
  const { data: rows } = await admin.from("customer_requests").select("id, status, title, created_at").eq("organization_id", ORG).ilike("title", "%E2E ribos testas%").order("created_at", { ascending: false }).limit(12);
  log({ step: "created_rows", n: (rows || []).length });
  if (rows && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const { error: ce } = await admin.from("customer_requests").update({ status: "closed" }).in("id", ids);
    log({ step: "cleanup_closed", n: ids.length, error: ce ? ce.message : null });
  }
  if (PHASE === "after") {
    const portal = await p.evaluate(async () => { const r = await fetch("/api/billing/portal", { method: "POST" }); return { status: r.status, body: await r.json() }; });
    log({ step: "portal", status: portal.status, ok: portal.body.ok, urlHost: portal.body.url ? new URL(portal.body.url).host : null, reason: portal.body.reason ?? null });
  }
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0, readback: "select event_type, processed_at is not null processed, test_mode, created_at from payment_webhook_events order by created_at desc limit 10; select plan_key, status, organization_id, provider_subscription_id, updated_at from billing_subscriptions order by updated_at desc limit 3; select id, email, provider_customer_id from billing_customers limit 3" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
