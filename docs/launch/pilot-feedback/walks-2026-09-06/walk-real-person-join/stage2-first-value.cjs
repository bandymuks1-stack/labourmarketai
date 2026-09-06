// WINDOW 6 LANE A — stage 2: first value for the person who just joined (1280, session reused).
// Sentences typed as a person types them; forms observed; ONE journal entry + ONE interest
// signal are the only writes (both rolled back by the residue step, reported before/after).
//   EXPECT_BUILD=<sha> SCRATCH=<dir> node stage2-first-value.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const HOST = "https://labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const SCRATCH = process.env.SCRATCH; if (!SCRATCH) throw new Error("SCRATCH required");
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
const textOf = async (loc) => (await loc.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const MARKER = "E2E-JOIN-" + Date.now();

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: "lt-LT", storageState: path.join(SCRATCH, "join-state.json") });
  const p = await c.newPage();
  const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
  await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
  await p.waitForTimeout(4000);

  const forms = () => p.locator("main input, main select, main textarea").evaluateAll((els) => els.filter((e) => e.getAttribute("data-testid") !== "composer-input").map((e) => (e.getAttribute("data-testid") || e.name || e.type) + ":" + e.type + ":" + String(e.value || "").slice(0, 30)));
  const ask = async (sentence, maxMs = 45000) => {
    const thread = p.getByTestId("conversation-thread");
    const aBefore = await p.getByTestId("msg-assistant").count();
    const rBefore = await p.getByTestId("msg-result").count();
    const t0 = Date.now();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    let ms = -1;
    while (Date.now() - t0 < maxMs) {
      await p.waitForTimeout(1000);
      const typing = await p.getByTestId("chat-typing").count();
      const grew = (await p.getByTestId("msg-assistant").count()) > aBefore || (await p.getByTestId("msg-result").count()) > rBefore || (await p.locator("main form").count()) > 0;
      if (!typing && grew) { ms = Date.now() - t0; break; }
    }
    await p.waitForTimeout(6000);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    return { sentence, ms, text: bubbles.slice(aBefore).join(" | ").replace(/\s+/g, " ").trim().slice(0, 900), results: (await p.getByTestId("msg-result").count()) - rBefore, chips: (await thread.locator("button").allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean).slice(-8), forms: await forms(), errors: await p.getByTestId("msg-error").allInnerTexts().catch(() => []) };
  };

  // A. the sentence the landing lost, typed again by hand
  log({ leg: "A_sentence", ...(await ask("esu suvirintojas, ieškau darbo Norvegijoje")) });
  await shot(p, "10-A-sentence-1280");
  // B. availability in plain words
  log({ leg: "B_availability", ...(await ask("galiu dirbti nuo spalio 1 d.")) });
  await shot(p, "11-B-availability-1280");
  // C. one experience line
  log({ leg: "C_experience", ...(await ask("dirbau suvirintoju Norvegijoje 3 metus")) });
  await shot(p, "12-C-experience-1280");
  // D. journal entry through the chat two-step save
  const d = await ask("Užpildyk darbo žurnalą");
  log({ leg: "D_journal_open", ...d });
  const date = p.locator('input[type="date"]').first();
  if (await date.count()) {
    await date.fill("2026-09-05");
    const textInputs = p.locator('main form input[type="text"]');
    if (await textInputs.count()) await textInputs.first().fill("Oslo, Norvegija");
    const ta = p.locator("main form textarea").first();
    if (await ta.count()) await ta.fill(MARKER + " suvirinimo darbai laivų statykloje");
    log({ leg: "D_journal_form", forms: await forms(), buttons: await p.locator("main form button").allInnerTexts() });
    await shot(p, "13-D-journal-form-1280");
    for (let i = 0; i < 3; i++) {
      const save = p.getByRole("button", { name: /^Išsaugoti$/ }).last();
      if ((await save.count()) === 0) break;
      await save.click(); await p.waitForTimeout(2500);
      const confirming = await p.getByText(/Patvirtinti įrašą/i).count();
      log({ leg: "D_journal_save_step", i, confirming });
      if (confirming === 0) break;
    }
    await p.waitForTimeout(3000);
    log({ leg: "D_journal_after_save", text: (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).slice(-2).map((s) => s.replace(/\s+/g, " ").trim().slice(0, 300)), results: await p.getByTestId("msg-result").allInnerTexts().catch(() => []), marker: MARKER });
    await shot(p, "14-D-journal-saved-1280");
  }
  // E. opportunities narrowed?
  const e = await ask("ieškau darbo Norvegijoje");
  log({ leg: "E_opportunities", ...e });
  const cards = await p.locator('[data-testid^="interest-"]').count();
  const express = p.getByTestId("interest-express");
  const listingText = (await textOf(p.getByTestId("conversation-thread"))).slice(-1500);
  log({ leg: "E_board", interestControls: cards, expressButtons: await express.count(), tail: listingText });
  await shot(p, "15-E-board-1280");
  if (await express.count()) {
    const card = express.first().locator("xpath=ancestor::*[starts-with(@data-testid,'interest-')][1]");
    const reqId = await card.getAttribute("data-testid").catch(() => null);
    await express.first().click(); await p.waitForTimeout(4000);
    log({ leg: "E_interest_clicked", reqId, sent: await p.getByTestId("interest-sent").count(), text: await textOf(card) });
    await shot(p, "16-E-interest-1280");
  }
  // F. what the person asks when lost
  log({ leg: "F_what_next", ...(await ask("ką man daryti toliau?")) });
  await shot(p, "17-F-what-next-1280");
  // G. profile page after the walk
  await p.goto(HOST + "/lt/dashboard/profile", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  log({ leg: "G_profile", text: (await textOf(p.locator("main").first())).slice(0, 1200) });
  await shot(p, "18-G-profile-1280");
  log({ leg: "failed_requests", failed: failed.slice(0, 10) });
  await c.close();
  // H. RETURN — new context, same cookie
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true, storageState: path.join(SCRATCH, "join-state.json") });
  const p2 = await c2.newPage();
  const t0 = Date.now();
  await p2.goto(HOST + "/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p2.waitForTimeout(3000);
  log({ leg: "H_return_landing", url: p2.url().replace(HOST, ""), header: (await p2.locator("header").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200) });
  await p2.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p2.getByTestId("composer-input").waitFor({ timeout: 90000 });
  await p2.waitForTimeout(12000);
  log({ leg: "H_return_chat", ms: Date.now() - t0, greeting: await textOf(p2.getByTestId("msg-greeting")).catch(() => ""), assistant: (await p2.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).map((s) => s.replace(/\s+/g, " ").trim().slice(0, 400)), chips: (await p2.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean).slice(-8) });
  await shot(p2, "19-H-return-390");
  await c2.close(); await b.close();
  log({ result: "STAGE2_DONE", marker: MARKER });
})().catch((e) => { log({ result: "STAGE2_ERROR", error: String(e && e.stack || e) }); process.exit(1); });
