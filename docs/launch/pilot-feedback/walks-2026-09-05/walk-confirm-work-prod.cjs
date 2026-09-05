// Production walk — §14 WORK → EVIDENCE → EMPLOYER CONFIRMATION → VERIFIED CAPABILITY → IDENTITY, by sentence:
//  1. manager (E2E Walker UAB): "ką reikia patvirtinti?" → what awaits + who is not reviewable yet (E2E Worker Two);
//  2. "Įjungti peržiūrą: E2E Worker Two" → set_engagement_journal_review(true) → the SAME read again: the person's
//     entry ("Klojau pamatus Vilniaus objekte…", 01d4a36d) now awaits confirmation;
//  3. "Patvirtinti: E2E Worker Two · <date>" (important tier; the chip is the confirmation) →
//     confirm_entry_and_verify_skills → "Patvirtinta: … — įgūdžių patvirtinta: N." → the read again: nothing awaits;
//  4. the person (E2E Worker Two): "mano kortelė" → the professional card shows the employer-verified state.
// Readback (MCP): engagement_contexts 90da8c16 journal_review_enabled=true; journal_entry_confirmations for
// entry 01d4a36d; worker_skills verified=true count for worker 0dbd5eda. Residue kept: the confirmation (evidence).
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const PERSON = "E2E Worker Two";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-confirm-work"); fs.mkdirSync(OUT, { recursive: true });
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
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    return c.newPage();
  };
  const t0 = Date.now();
  const p = await open(MANAGER, { width: 1280, height: 900 });
  const text = async () => p.locator("body").innerText();
  await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  const composer = p.getByTestId("composer-input");
  await composer.waitFor({ timeout: 90000 });
  const say = async (s, ms) => { await composer.fill(s); await composer.press("Enter"); await p.waitForTimeout(ms); };
  const click = async (re, ms) => { const btn = p.getByRole("button", { name: re }).last(); const n = await btn.count(); if (n > 0) { await btn.click(); await p.waitForTimeout(ms); } return n > 0; };
  const tail = (body) => body.split("\n").filter((l) => /Laukia patvirtinimo|Laukiančių darbo|peržiūra dar neįjungta|Peržiūra įjungta|Patvirtinta:|Klojau|^• /.test(l)).slice(-6).map((l) => l.slice(0, 140));
  // 1. what awaits
  await say("ką reikia patvirtinti?", 14000);
  let body = await text();
  const enableLabels = await p.getByRole("button", { name: /^Įjungti peržiūrą: / }).allInnerTexts();
  log({ step: "awaits", ms: Date.now() - t0, lines: tail(body), enableChip: (await p.getByRole("button", { name: `Įjungti peržiūrą: ${PERSON}`, exact: true }).count()) > 0, enableLabels, confirmChip: (await p.getByRole("button", { name: /^Patvirtinti: / }).count()) > 0 });
  await p.screenshot({ path: path.join(OUT, "10-awaits.png") });
  // 2. enable review (only when offered)
  if (await click(/^Įjungti peržiūrą: /, 16000)) {
    body = await text();
    log({ step: "review_on", ms: Date.now() - t0, said: (body.match(/Peržiūra įjungta[^\n]*/) || [null])[0], lines: tail(body) });
    await p.screenshot({ path: path.join(OUT, "11-review-on.png") });
  }
  // 3. confirm
  const confirmLabels = await p.getByRole("button", { name: /^Patvirtinti: / }).allInnerTexts();
  log({ step: "confirm_chips", confirmLabels });
  const confirmed = await click(/^Patvirtinti: /, 18000);
  body = await text();
  log({ step: "confirm", ms: Date.now() - t0, chip: confirmed, said: (body.match(/Patvirtinta: [^\n]*/) || [null])[0], failed: /Patvirtinti nepavyko/.test(body), after: tail(body) });
  await p.screenshot({ path: path.join(OUT, "12-confirmed.png") });
  // 4. the person's identity
  const w = await open(WORKER, { width: 390, height: 844 });
  await w.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  const wc = w.getByTestId("composer-input");
  await wc.waitFor({ timeout: 90000 });
  await w.waitForTimeout(9000); // the brief is pushed asynchronously after mount
  // #1515 — the person’s brief says the employer CONFIRMED their work (from the evidence rows, no notification truth)
  const wbrief = await w.locator("body").innerText();
  log({ step: "person_brief", ms: Date.now() - t0, confirmedLine: (wbrief.match(/Darbdavys patvirtino.{0,140}/) || [null])[0], cardChip: (await w.getByRole("button", { name: "Mano kortelė", exact: true }).count()) > 0 });
  await w.screenshot({ path: path.join(OUT, "12b-person-brief.png") });
  await wc.fill("mano kortelė"); await wc.press("Enter");
  await w.waitForTimeout(14000);
  const wbody = await w.locator("body").innerText();
  log({ step: "person_card", ms: Date.now() - t0, verifiedWords: (wbody.match(/patvirtint[^\n]{0,80}/gi) || []).slice(0, 4), cardPresent: /Kortel|kortel/.test(wbody) });
  await w.screenshot({ path: path.join(OUT, "13-person-card.png") });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0, readback: "select journal_review_enabled from engagement_contexts where id::text like '90da8c16%'; select count(*) confirmations from journal_entry_confirmations where entry_id::text like '01d4a36d%'; select count(*) filter (where verified) verified, count(*) total from worker_skills where worker_id='0dbd5eda-59b3-4f89-8d8e-01f41a542bd2'" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
