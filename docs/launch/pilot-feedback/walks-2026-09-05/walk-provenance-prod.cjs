// Production walk — P2/P6 subset (#1536): the card's DERIVED provenance edge + object language.
//  W1 worker (confirmed entry 01d4a36d by E2E Walker UAB) → "mano kortelė" → [worker-player-card][data-provenance=EMPLOYER_CONFIRMED],
//     [data-provenance-edge=EMPLOYER_CONFIRMED], [player-card-provenance] "Patvirtino E2E Walker UAB, 2026-09-05"; the brief line
//     "Darbdavys patvirtino…" (C12 propagation: brief + card on ONE SHA); /lt/dashboard/journal shows the same line.
//  W2 negative control: an unconfirmed worker → data-provenance=SELF_DECLARED, no gold edge.
//  M1 employer: "kas laisvas?" → no raw #xxxxxx fragments; "ar žmonės pasiruošę …?" → ends with the DERIVED marker.
//  R1 regression (#1535): /lt/dashboard/company still renders company-home-attention-line.
// No writes → zero residue.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const CONTROL = process.env.CONTROL_EMAIL || "e2e-learner-202609021634@labourmarket.ai";
const PROJECT = "E2E Vilniaus objektas (testinis)";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-provenance"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
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
  const open = async (email, viewport, pathname) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai" + pathname, { waitUntil: "domcontentloaded", timeout: 60000 });
    return p;
  };
  const say = async (p, s, re, max = 20) => {
    await p.getByTestId("composer-input").fill(s); await p.getByTestId("composer-input").press("Enter");
    let body = "";
    for (let i = 0; i < max; i++) { await p.waitForTimeout(1500); body = await p.locator("body").innerText(); if (re.test(body)) break; }
    return body;
  };
  const cardFacts = async (p) => {
    const card = p.locator('[data-testid="worker-player-card"]').first();
    const has = (await card.count()) > 0;
    if (!has) return { card: false };
    const prov = p.locator('[data-testid="player-card-provenance"]').first();
    return {
      card: true,
      provenance: await card.getAttribute("data-provenance"),
      edge: await p.locator("[data-provenance-edge]").first().getAttribute("data-provenance-edge").catch(() => null),
      line: (await prov.count()) ? (await prov.innerText()).replace(/\s+/g, " ").trim() : null,
    };
  };
  const t0 = Date.now();
  // W1 — confirmed worker
  const w = await open(WORKER, { width: 390, height: 844 }, "/lt/dashboard");
  await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
  await w.waitForTimeout(4000);
  const brief = (await w.locator("body").innerText()).replace(/\s+/g, " ");
  const briefLine = (brief.match(/Darbdavys patvirtino[^.]*\./) || [null])[0];
  const body1 = await say(w, "mano kortelė", /Kilmė|Patvirtino|kortel/i);
  await w.waitForTimeout(2000);
  const facts1 = await cardFacts(w);
  log({ step: "W1_card", briefLine, facts: facts1, resultPresent: (await w.getByTestId("player-card-result").count()) > 0, rawIdFragments: (body1.match(/#[0-9a-f]{6}\b/g) || []).length });
  await w.screenshot({ path: path.join(OUT, "01-card-confirmed.png"), fullPage: true });
  await w.goto("https://labourmarket.ai/lt/dashboard/journal", { waitUntil: "domcontentloaded", timeout: 60000 });
  await w.waitForTimeout(5000);
  const factsJournal = await cardFacts(w);
  log({ step: "W1_journal_same_card", facts: factsJournal, sameLine: !!facts1.line && factsJournal.line === facts1.line });
  // /en wording
  await w.goto("https://labourmarket.ai/en/dashboard/journal", { waitUntil: "domcontentloaded", timeout: 60000 });
  await w.waitForTimeout(5000);
  log({ step: "W1_en", facts: await cardFacts(w) });
  // W2 — negative control
  let control = null;
  try {
    const c = await open(CONTROL, { width: 390, height: 844 }, "/lt/dashboard/journal");
    await c.waitForTimeout(6000);
    control = await cardFacts(c);
    if (!control.card) { await c.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded" }); await c.getByTestId("composer-input").waitFor({ timeout: 60000 }); await say(c, "mano kortelė", /Kilmė|kortel|CV/i); await c.waitForTimeout(2000); control = await cardFacts(c); }
    await c.screenshot({ path: path.join(OUT, "02-card-control.png"), fullPage: true });
  } catch (e) { control = { error: String(e && e.message).slice(0, 120) }; }
  log({ step: "W2_control", control });
  // M1 — employer object language
  const m = await open(MANAGER, { width: 1280, height: 900 }, "/lt/dashboard");
  await m.getByTestId("composer-input").waitFor({ timeout: 90000 });
  const free = await say(m, "kas laisvas?", /laisv/i);
  const freeAnswer = free.replace(/\s+/g, " ");
  const ready = await say(m, `ar žmonės pasiruošę projektui ${PROJECT}?`, /Išvesta|pasiruoš|dokument/i);
  const readyAnswer = ready.replace(/\s+/g, " ");
  log({ step: "M1_object_language", freeRawIds: (freeAnswer.match(/#[0-9a-f]{6}\b/g) || []).length, freeExcerpt: (freeAnswer.match(/Kas laisvas[^]{0,200}|laisv[^]{0,160}/i) || [""])[0].slice(0, 220), readyDerivedMarker: /Išvesta iš dokumentų sąrašo ir profilio įrašų — ne įvertinimas/.test(readyAnswer), readyExcerpt: (readyAnswer.match(/Išvesta[^.]*\./) || [null])[0] });
  await m.screenshot({ path: path.join(OUT, "03-employer.png"), fullPage: true });
  // R1 — company home regression (#1535)
  await m.goto("https://labourmarket.ai/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
  await m.getByTestId("company-home-field").waitFor({ timeout: 90000 });
  await m.waitForTimeout(2000);
  log({ step: "R1_company_home", attentionLines: await m.getByTestId("company-home-attention-line").count(), attentionUnavailable: await m.getByTestId("company-home-attention-unavailable").count(), attentionNone: await m.getByTestId("company-home-attention-none").count() });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
