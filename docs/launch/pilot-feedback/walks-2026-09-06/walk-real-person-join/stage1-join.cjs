// WINDOW 6 LANE A — REAL PERSON JOIN, stage 1 (anonymous → landing → door → signup →
// check-your-email → confirmation → login → onboarding → first screen).
//
// Creates ONE controlled E2E identity through the REAL UI (pattern e2e-*@labourmarket.ai,
// never a real person). Confirmation is done the agent way (admin.updateUserById
// email_confirm — documented in the report) because real-inbox delivery is owner gate G-1.
// The password is generated here and stored ONLY in the scratch secret file.
//
//   EXPECT_BUILD=<sha> SCRATCH=<dir> node stage1-join.cjs
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";
const EMAIL = "e2e-join-2026-09-06@labourmarket.ai";
const SENTENCE = "esu suvirintojas, ieškau darbo Norvegijoje";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const SCRATCH = process.env.SCRATCH; if (!SCRATCH) throw new Error("SCRATCH required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
const overflow = (p) => p.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const tapSizes = (p, sel) => p.$$eval(sel, (els) => els.slice(0, 12).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.getAttribute("aria-label") || e.name || "").slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; }));

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

  const secretPath = path.join(SCRATCH, "join-secret.json");
  let password;
  if (fs.existsSync(secretPath)) password = JSON.parse(fs.readFileSync(secretPath, "utf8")).password;
  else { password = "Jn!" + crypto.randomBytes(12).toString("base64url") + "9A"; fs.writeFileSync(secretPath, JSON.stringify({ email: EMAIL, password })); }

  const b = await chromium.launch();
  const t = {}; const T = (k) => (t[k] = Date.now());
  // ── 1. ANONYMOUS landing, desktop 1280 ─────────────────────────────────────
  const c1 = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "lt-LT" });
  const p = await c1.newPage();
  const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
  T("landing0"); await p.goto(HOST + "/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("entry-input").waitFor({ timeout: 60000 }); T("landing1");
  log({ step: "landing", ms: t.landing1 - t.landing0, title: await p.title() });
  const aboveFold = await p.evaluate(() => (document.querySelector("main") || document.body).innerText.slice(0, 600).replace(/\s+/g, " "));
  log({ step: "landing_first_words", text: aboveFold });
  await p.getByTestId("entry-input").fill(SENTENCE); await p.getByTestId("entry-submit").click();
  await p.getByTestId("entry-understanding").waitFor({ timeout: 15000 });
  const und = p.getByTestId("entry-understanding");
  log({ step: "landing_understanding", intent: await und.getAttribute("data-intent"), text: await textOf(und) });
  await shot(p, "01-landing-understood-1280");
  const doorHref = await p.getByTestId("entry-signup").locator("a").getAttribute("href");
  log({ step: "door_href", href: doorHref });
  await p.getByTestId("entry-signup").locator("a").click();
  await p.waitForURL(/auth\/signup/, { timeout: 30000 });
  log({ step: "signup_url", url: p.url().replace(HOST, "") });
  await p.locator("form").waitFor({ timeout: 30000 });
  log({ step: "signup_form_text", text: await textOf(p.locator("main").first()) });
  log({ step: "signup_buttons", buttons: await p.locator("main button, main a").allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean)) });
  await shot(p, "02-signup-1280");

  // ── 1b. ANONYMOUS signup at 390 (clipping / tap targets) ──────────────────
  {
    const cm = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true });
    const pm = await cm.newPage();
    await pm.goto(HOST + "/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
    await pm.getByTestId("entry-input").waitFor({ timeout: 60000 });
    log({ step: "landing_390_overflow", ...(await overflow(pm)) });
    await pm.getByTestId("entry-input").fill(SENTENCE); await pm.getByTestId("entry-submit").click();
    await pm.getByTestId("entry-understanding").waitFor({ timeout: 15000 });
    await shot(pm, "01m-landing-understood-390");
    await pm.getByTestId("entry-signup").locator("a").click();
    await pm.waitForURL(/auth\/signup/, { timeout: 30000 }); await pm.locator("form").waitFor({ timeout: 30000 });
    log({ step: "signup_390_overflow", ...(await overflow(pm)) });
    log({ step: "signup_390_taps", taps: await tapSizes(pm, "main button, main input, main a") });
    await shot(pm, "02m-signup-390");
    // Google door read-only: the button is present? (never authenticate)
    const g = pm.getByRole("button", { name: /Google/ });
    log({ step: "signup_390_google_present", count: await g.count() });
    await cm.close();
  }

  // ── 2. SIGNUP through the real form ───────────────────────────────────────
  await p.locator('input[name="email"]').fill(EMAIL);
  await p.locator('input[name="password"]').fill(password);
  await p.locator('input[name="confirm_password"]').fill(password);
  T("signup0"); await p.locator('form button[type="submit"]').click();
  await p.getByTestId("signup-check-email").waitFor({ timeout: 30000 }); T("signup1");
  const ce = p.getByTestId("signup-check-email");
  log({ step: "check_email_screen", ms: t.signup1 - t.signup0, text: await textOf(ce), buttons: await ce.locator("button, a").allInnerTexts() });
  await shot(p, "03-check-email-1280");
  await p.waitForTimeout(62000);
  log({ step: "check_email_after_cooldown", text: await textOf(ce), resendVisible: await p.getByTestId("signup-resend").count() });
  await shot(p, "03b-check-email-after-60s-1280");

  // ── 3. What an UNCONFIRMED person sees when they try to log in ────────────
  const loginLink = await ce.locator("a").first().getAttribute("href");
  log({ step: "check_email_login_link", href: loginLink });
  await p.goto(HOST + loginLink, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.locator('input[name="email"]').fill(EMAIL); await p.locator('input[name="password"]').fill(password);
  await p.locator('form button[type="submit"]').click();
  await p.waitForTimeout(6000);
  log({ step: "login_unconfirmed", url: p.url().replace(HOST, ""), text: (await textOf(p.locator("main").first())).slice(0, 700) });
  await shot(p, "04-login-unconfirmed-1280");

  // ── 4. CONFIRM the agent way (admin.updateUserById email_confirm) ─────────
  const { data: ulist, error: le } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 }); if (le) throw le;
  const user = ulist.users.find((u) => u.email === EMAIL); if (!user) throw new Error("user not created");
  log({ step: "user_row", id: user.id, confirmed_before: user.email_confirmed_at ?? null, created: user.created_at });
  const { error: ce2 } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true }); if (ce2) throw ce2;
  log({ step: "confirmed_via", method: "auth.admin.updateUserById(email_confirm:true)" });

  // ── 5. LOGIN (the person now uses the login door with the same next=) ─────
  await p.goto(HOST + loginLink, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.locator('input[name="email"]').fill(EMAIL); await p.locator('input[name="password"]').fill(password);
  T("login0"); await p.locator('form button[type="submit"]').click();
  await p.waitForURL(/onboarding|dashboard/, { timeout: 60000 }); T("login1");
  log({ step: "after_login", ms: t.login1 - t.login0, url: p.url().replace(HOST, "") });
  await c1.storageState({ path: path.join(SCRATCH, "join-state.json") });

  // ── 6. ONBOARDING at 390 (the mobile person) ──────────────────────────────
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true, storageState: path.join(SCRATCH, "join-state.json") });
  const pm = await cm.newPage();
  const failedM = []; pm.on("response", (r) => { if (r.status() >= 400) failedM.push(r.status() + " " + r.url().replace(HOST, "")); });
  T("onb0"); await pm.goto(HOST + p.url().replace(HOST, ""), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pm.getByTestId("onboarding-intents").waitFor({ timeout: 60000 }); T("onb1");
  log({ step: "onboarding_step1", ms: t.onb1 - t.onb0, url: pm.url().replace(HOST, ""), ...(await overflow(pm)), text: await textOf(pm.locator("main").first()) });
  log({ step: "onboarding_step1_cards", cards: await pm.locator('[data-testid^="onboarding-intent-"]').allInnerTexts().then((a) => a.map((s) => s.replace(/\s+/g, " ").trim())), preselected: await pm.locator('[data-testid^="onboarding-intent-"][aria-pressed="true"]').count() });
  await shot(pm, "05m-onboarding-step1-390");
  await pm.getByTestId("onboarding-intent-work").click();
  await pm.getByTestId("onboarding-intents-continue").click();
  await pm.locator('select[name="country"]').waitFor({ timeout: 15000 });
  log({ step: "onboarding_step2", ...(await overflow(pm)), text: await textOf(pm.locator("main").first()), fields: await pm.locator("main input, main select").evaluateAll((els) => els.map((e) => e.name + ":" + (e.value || ""))) });
  await shot(pm, "06m-onboarding-step2-390");
  const profOptions = await pm.locator('select[name="profession_slug"] option').allInnerTexts();
  log({ step: "profession_options", count: profOptions.length, sample: profOptions.slice(0, 8) });
  await pm.locator('select[name="country"]').selectOption("LT");
  await pm.locator('select[name="profession_slug"]').selectOption("welder");
  T("onbsub0"); await pm.locator('form button[type="submit"]').click();
  await pm.waitForURL(/dashboard/, { timeout: 90000 }); T("onbsub1");
  log({ step: "after_onboarding", ms: t.onbsub1 - t.onbsub0, url: pm.url().replace(HOST, "") });
  // ── 7. FIRST SCREEN — does the landing sentence arrive? ───────────────────
  await pm.getByTestId("composer-input").waitFor({ timeout: 90000 }); T("first1");
  await pm.waitForTimeout(12000);
  const userTurns = await pm.locator('[data-testid="msg-user"]').allInnerTexts().catch(() => []);
  const assistant = await pm.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
  const results = await pm.getByTestId("msg-result").count();
  const composerVal = await pm.getByTestId("composer-input").inputValue();
  log({ step: "first_screen_390", url: pm.url().replace(HOST, ""), ...(await overflow(pm)), userTurns, assistant: assistant.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 400)), results, composerVal, chips: (await pm.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => [])).slice(-8) });
  await shot(pm, "07m-first-screen-390");
  log({ step: "first_screen_390_taps", taps: await tapSizes(pm, '[data-testid="conversation-thread"] button') });
  await cm.storageState({ path: path.join(SCRATCH, "join-state.json") });
  log({ step: "failed_requests", desktop: failed.slice(0, 8), mobile: failedM.slice(0, 8) });
  await cm.close(); await c1.close(); await b.close();
  log({ result: "STAGE1_DONE" });
})().catch((e) => { log({ result: "STAGE1_ERROR", error: String(e && e.stack || e) }); process.exit(1); });
