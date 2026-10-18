// Production walk — P2/P6 chat legs (#1536), with a wait helper that waits for a NEW assistant result (never the user's own echo):
//  W1 worker brief line "Darbdavys patvirtino…" (C12 propagation) + "mano kortelė" → [player-card-result] → card provenance;
//  M1 employer "kas laisvas?" → the who-available answer, no raw #xxxxxx ids; "ar žmonės pasiruošę projektui …?" → the DERIVED marker.
// No writes → zero residue.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
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
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(6000);
    return p;
  };
  /** Sends a sentence and returns the text of assistant content that appeared AFTER it (new [msg-result] or thread growth). */
  const ask = async (p, sentence, maxMs = 45000) => {
    const thread = p.getByTestId("conversation-thread");
    const before = (await thread.innerText()).length;
    const resultsBefore = await p.getByTestId("msg-result").count();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    const t = Date.now(); let text = "";
    while (Date.now() - t < maxMs) {
      await p.waitForTimeout(1500);
      const typing = await p.getByTestId("chat-typing").count();
      const full = await thread.innerText();
      const grew = full.length > before + sentence.length + 20;
      if (!typing && (grew || (await p.getByTestId("msg-result").count()) > resultsBefore)) { text = full.slice(full.lastIndexOf(sentence) + sentence.length); break; }
    }
    return text.replace(/\s+/g, " ").trim();
  };
  const t0 = Date.now();
  // W1 — worker
  const w = await open(WORKER, { width: 390, height: 844 });
  const opening = (await w.getByTestId("conversation-thread").innerText()).replace(/\s+/g, " ");
  const briefLine = (opening.match(/Darbdavys patvirtino[^.]*\./) || [null])[0];
  const cardAnswer = await ask(w, "mano kortelė");
  await w.waitForTimeout(2000);
  const card = w.locator('[data-testid="worker-player-card"]').first();
  const facts = (await card.count()) ? { provenance: await card.getAttribute("data-provenance"), edge: await w.locator("[data-provenance-edge]").first().getAttribute("data-provenance-edge").catch(() => null), line: await w.locator('[data-testid="player-card-provenance"]').first().textContent().catch(() => null) } : { card: false };
  log({ step: "W1_worker", briefLine, openingExcerpt: opening.slice(0, 300), resultPresent: (await w.getByTestId("player-card-result").count()) > 0, facts, answerExcerpt: cardAnswer.slice(0, 200) });
  await w.screenshot({ path: path.join(OUT, "05-chat-card.png"), fullPage: true });
  // M1 — employer
  const m = await open(MANAGER, { width: 1280, height: 900 });
  const free = await ask(m, "kas laisvas?");
  const ready = await ask(m, `ar žmonės pasiruošę projektui ${PROJECT}?`);
  log({ step: "M1_employer", freeExcerpt: free.slice(0, 260), freeRawIds: (free.match(/#[0-9a-f]{6}\b/g) || []).length, readyExcerpt: ready.slice(0, 320), readyDerivedMarker: /Išvesta iš dokumentų sąrašo ir profilio įrašų — ne įvertinimas/.test(ready), readyRawIds: (ready.match(/#[0-9a-f]{6}\b/g) || []).length });
  await m.screenshot({ path: path.join(OUT, "06-employer-chat.png"), fullPage: true });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
