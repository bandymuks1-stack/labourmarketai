/**
 * walk-billing-safety-prod.cjs — production proof of billing safety v1 WITHOUT money (#1552 served, migration applied
 * 2026-09-05 18:49 UTC as ledger 20260905184921).
 *   1. checkout idempotency: the SAME organisation owner posts /api/billing/test-checkout twice in a row (double click /
 *      second tab) → the second answer must carry `reused: true` and the SAME operationId + Checkout URL (Stripe replays
 *      the session; no second payable session is minted). The walk STOPS at the URL — no card is ever entered.
 *   2. one-active-subscription admission is observable only with a real subscription (EXTERNAL_REAL_CUSTOMER_PROOF_PENDING).
 *   3. reconcile route: superadmin-only — the only admin in production is a real person's account, which the agent never
 *      impersonates; the walk records 403 for the E2E identity (the gate holds) and leaves the 200 report to the owner.
 * Residue: one `billing_checkout_operations` row `open` for E2E Walker UAB (expires with the Checkout Session) + the LIVE
 * Checkout Session itself (no financial activity). Readback SQL printed at the end.
 * Usage: EXPECT_BUILD=<sha7> node walk-billing-safety-prod.cjs
 */
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const ORG = "a996113c-6155-4ca6-9bac-4fc7bf7db8ae";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-billing-safety"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const startedAt = new Date().toISOString();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: MANAGER }); if (error) throw error;
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: v } = await anon.auth.verifyOtp({ email: MANAGER, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
  const cookieValue = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: cookieValue, domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  await p.goto(HOST + "/lt/dashboard/account", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("account-billing-status").waitFor({ timeout: 60000 });
  log({ step: "account", billingState: await p.getByTestId("account-billing-status").getAttribute("data-billing-state"), subStatus: await p.getByTestId("account-billing-status").getAttribute("data-subscription-status"), orderButton: (await p.getByTestId("test-checkout-company_pilot").count()) > 0 });
  await p.screenshot({ path: path.join(OUT, "01-account.png") });
  // 1. two immediate posts — the double click
  const two = await p.evaluate(async () => {
    const post = async () => { const r = await fetch("/api/billing/test-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planKey: "company_pilot" }) }); return { status: r.status, body: await r.json() }; };
    const a = await post(); const b2 = await post();
    return { a, b: b2 };
  });
  const strip = (x) => ({ status: x.status, ok: x.body.ok, reason: x.body.reason ?? null, operationId: x.body.operationId ?? null, reused: x.body.reused ?? null, testMode: x.body.testMode ?? null, urlHost: x.body.url ? new URL(x.body.url).host : null, sessionTail: x.body.url ? x.body.url.slice(-12) : null });
  const A = strip(two.a), B = strip(two.b);
  log({ step: "checkout_double_click", first: A, second: B, sameOperation: !!A.operationId && A.operationId === B.operationId, sameSession: !!A.sessionTail && A.sessionTail === B.sessionTail, secondReused: B.reused === true });
  // 1b. a third post from a fresh page (second tab / refresh)
  const p2 = await c.newPage();
  await p2.goto(HOST + "/lt/dashboard/account", { waitUntil: "domcontentloaded", timeout: 60000 });
  const three = await p2.evaluate(async () => { const r = await fetch("/api/billing/test-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planKey: "company_pilot" }) }); return { status: r.status, body: await r.json() }; });
  const C = strip(three);
  log({ step: "checkout_second_tab", third: C, sameOperation: !!A.operationId && A.operationId === C.operationId, reused: C.reused === true });
  // 3. reconcile — the E2E organisation owner is NOT an admin: the gate must answer 403
  const rec = await p.evaluate(async () => { const r = await fetch("/api/billing/reconcile"); return { status: r.status, body: await r.json().catch(() => null) }; });
  log({ step: "reconcile_gate_non_admin", status: rec.status, reason: rec.body && rec.body.reason, heldClosed: rec.status === 403 });
  await b.close();
  log({ step: "residue", identities: { manager: MANAGER, org: ORG, keep: true }, created: { operation: A.operationId, since: startedAt },
    readback: [
      `select id, scope_key, plan_key, status, test_mode, provider_price_id, left(idempotency_key,12) key12, provider_session_id is not null has_session, expires_at, created_at from billing_checkout_operations where created_at >= '${startedAt}' order by created_at`,
      `select count(*) open_ops from billing_checkout_operations where status = 'open'`,
      `select owner_id, provider, test_mode, provider_customer_id like 'cus_%' cus from billing_customers`,
      `select count(*) from billing_subscriptions`, `select count(*) from payment_webhook_events`,
    ] });
  log({ step: "done" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
