// PRODUCTION WALK — a real person joins (window 6 lane A, PR fix/cc/w6-real-person-join).
//
// WHAT IT PROVES against production after the merge:
//   A. ANON 390: the signup a job-seeker reaches from their own sentence asks for a
//      plain e-mail (not a "work e-mail" with a company placeholder); Google door present.
//   B. FRESH PERSON (created the agent way — admin.createUser, email confirmed — because
//      real-inbox delivery is owner gate G-1): the REAL login form with the landing
//      sentence in ?next= lands on /onboarding WITH the sentence; the wizard shows it back,
//      "Ieškau darbo" is pre-ticked, the profession select already says welder; after
//      Finish the person is in the conversation and the sentence is THEIR first turn.
//      The identity is deleted afterwards (residue counts printed; a blocked delete is
//      reported, never hidden).
//   C. RETURN (the 2026-09-06 join identity, session cookie): an onboarded person who
//      opens /onboarding?next=/lt/dashboard?say=… is sent on with the sentence intact
//      (composer prefill or own turn); the return screen names the gap and offers chips.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-real-person-join-prod.cjs
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";
const JOINED = "e2e-join-2026-09-06@labourmarket.ai";
const SENTENCE = "esu suvirintojas, ieškau darbo Norvegijoje";
const SAY_NEXT = "/lt/dashboard?say=" + encodeURIComponent(SENTENCE).replace(/%20/g, "+");

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-real-person-join", "shots-prod"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();

  // ── A. ANON 390 — the signup a job-seeker reaches ─────────────────────────
  {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await p.goto(HOST + "/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("entry-input").waitFor({ timeout: 60000 });
    await p.getByTestId("entry-input").fill(SENTENCE); await p.getByTestId("entry-submit").click();
    await p.getByTestId("entry-understanding").waitFor({ timeout: 15000 });
    await p.getByTestId("entry-signup").locator("a").click();
    await p.waitForURL(/auth\/signup/, { timeout: 30000 }); await p.locator("form").waitFor({ timeout: 30000 });
    const labels = await p.locator("main label").allInnerTexts();
    const emailLabel = (labels.find((l) => /pašt/i.test(l)) || "").replace(/\s+/g, " ").trim();
    const placeholder = await p.locator('input[name="email"]').getAttribute("placeholder");
    log({ leg: "A_signup", url: p.url().replace(HOST, ""), emailLabel, placeholder, scrollW: await p.evaluate(() => document.documentElement.scrollWidth) });
    must("signup asks for a plain e-mail, not a work e-mail", /^El\. paštas/.test(emailLabel) && !/darbo/i.test(emailLabel), emailLabel);
    must("e-mail placeholder is not a company address", !/imone/i.test(placeholder || ""), placeholder);
    must("the sentence rides the signup door", /say%3D/.test(p.url()), p.url().replace(HOST, ""));
    must("Google door present", (await p.getByRole("button", { name: /Google/ }).count()) === 1);
    await shot(p, "A-signup-390");
    await c.close();
  }

  // ── B. FRESH PERSON — login form keeps the sentence into onboarding ───────
  const fresh = `e2e-join-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}@labourmarket.ai`;
  const password = "Jn!" + crypto.randomBytes(12).toString("base64url") + "9A";
  let freshId = null;
  {
    const { data: created, error } = await admin.auth.admin.createUser({ email: fresh, password, email_confirm: true, user_metadata: { locale: "lt" } });
    if (error) throw error;
    freshId = created.user.id;
    log({ leg: "B_created", email: fresh, id: freshId, confirmedVia: "auth.admin.createUser(email_confirm:true)" });
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true });
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + "/lt/auth/login?next=" + encodeURIComponent(SAY_NEXT), { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.locator('input[name="email"]').fill(fresh); await p.locator('input[name="password"]').fill(password);
    const t0 = Date.now();
    await p.locator('form button[type="submit"]').click();
    await p.waitForURL((u) => !/auth\/login/.test(u.pathname), { timeout: 60000 });
    const afterLogin = p.url().replace(HOST, "");
    log({ leg: "B_after_login", ms: Date.now() - t0, url: afterLogin });
    must("login lands on onboarding WITH the sentence in next=", /^\/lt\/onboarding\?next=.*say/.test(afterLogin), afterLogin);
    await p.getByTestId("onboarding-intents").waitFor({ timeout: 60000 });
    const said = await textOf(p.getByTestId("onboarding-said"));
    const workPressed = await p.getByTestId("onboarding-intent-work").getAttribute("aria-pressed");
    log({ leg: "B_step1", said, workPressed, scrollW: await p.evaluate(() => document.documentElement.scrollWidth) });
    must("the wizard shows the sentence back", said.includes(SENTENCE), said);
    must("'Ieškau darbo' is pre-ticked", workPressed === "true", workPressed);
    await shot(p, "B-onboarding-step1-390");
    await p.getByTestId("onboarding-intents-continue").click();
    await p.locator('select[name="profession_slug"]').waitFor({ timeout: 15000 });
    const prof = await p.locator('select[name="profession_slug"]').inputValue();
    must("the profession select already says welder", prof === "welder", prof);
    await p.locator('select[name="country"]').selectOption("LT");
    await shot(p, "B-onboarding-step2-390");
    await p.locator('form button[type="submit"]').click();
    await p.waitForURL((u) => !/onboarding/.test(u.pathname), { timeout: 90000 });
    log({ leg: "B_after_onboarding", url: p.url().replace(HOST, "") });
    must("after Finish the person is in the conversation, not on a profile wall", /^\/lt\/dashboard(\?|$)/.test(p.url().replace(HOST, "")), p.url().replace(HOST, ""));
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    let turn = ""; let composerVal = "";
    for (let i = 0; i < 20; i++) {
      await p.waitForTimeout(1000);
      const turns = await p.getByTestId("msg-user").allInnerTexts().catch(() => []);
      turn = turns.map((s) => s.replace(/\s+/g, " ").trim()).find((s) => s.includes(SENTENCE)) || "";
      composerVal = await p.getByTestId("composer-input").inputValue().catch(() => "");
      if (turn || composerVal.includes(SENTENCE)) break;
    }
    log({ leg: "B_first_screen", turn, composerVal, url: p.url().replace(HOST, "") });
    must("the landing sentence is the person's first turn (or waits in the composer)", turn.includes(SENTENCE) || composerVal.includes(SENTENCE), { turn, composerVal });
    await p.waitForTimeout(8000);
    log({ leg: "B_first_answer", assistant: (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim().slice(0, 300)) });
    await shot(p, "B-first-screen-390");
    log({ leg: "B_failed_requests", failed: failed.slice(0, 8) });
    await c.close();
  }
  // residue: the fresh identity — delete what blocks, then the user
  {
    const counts = async () => {
      const r = {};
      for (const [t, col] of [["pilot_events", "profile_id"], ["workers", "profile_id"], ["profiles", "id"]]) {
        const { count, error } = await admin.from(t).select("*", { count: "exact", head: true }).eq(col, freshId);
        r[t] = error ? "ERR " + error.code : count;
      }
      return r;
    };
    log({ leg: "B_residue_before", ...(await counts()) });
    const { error: pe } = await admin.from("pilot_events").delete().eq("profile_id", freshId);
    if (pe) log({ leg: "B_pilot_events_delete", error: pe.code + " " + pe.message });
    const { error: de } = await admin.auth.admin.deleteUser(freshId);
    log({ leg: "B_delete_user", ok: !de, error: de ? de.message : null });
    log({ leg: "B_residue_after", ...(await counts()) });
    must("fresh identity removed (or reported as standing E2E residue)", true, de ? "STANDING: " + fresh : "deleted");
  }

  // ── C. RETURN — the joined person (cookie), sentence intact through /onboarding ─
  {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(JOINED), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto(HOST + "/lt/onboarding?next=" + encodeURIComponent(SAY_NEXT), { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(6000);
    const turns = (await p.getByTestId("msg-user").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim());
    const composerVal = await p.getByTestId("composer-input").inputValue().catch(() => "");
    log({ leg: "C_onboarded_passthrough", url: p.url().replace(HOST, ""), turns: turns.slice(-2), composerVal });
    must("an onboarded person is sent on with the sentence intact", turns.some((s) => s.includes(SENTENCE)) || composerVal.includes(SENTENCE), { turns, composerVal });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(10000);
    const greeting = await textOf(p.getByTestId("msg-greeting"));
    const assistant = (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim());
    const chips = (await p.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    log({ leg: "C_return", greeting, assistant: assistant.map((s) => s.slice(0, 200)), chips: chips.slice(-8) });
    must("return screen greets by name", /Labas/.test(greeting), greeting);
    must("return screen says what is still missing and offers ≥3 next steps", assistant.some((s) => /trūksta|Mano profilis/i.test(s)) && chips.length >= 3, { assistant: assistant.slice(0, 2), chips: chips.length });
    await shot(p, "C-return-390");
    await c.close();
  }

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})().catch((e) => { log({ result: "ERROR", error: String(e && e.stack || e) }); process.exit(1); });
