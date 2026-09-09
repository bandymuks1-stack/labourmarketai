// Production walk — P3 REQUIREMENT LEDGER on the instructions page (#1525, ea47d022):
//  M1 manager "kas trūksta projektui …?" → "Paprašyti: E2E Worker Two" (a project-scoped instruction exists);
//  W1 worker /lt/dashboard/instructions → [data-testid=instruction-ledger-ratio] data-have/data-total, the rows with
//     state + why + resolutions; click the first "Įrašyti dokumentą" resolution → the documents centre prefilled;
//  readback printed: project_worker_readiness_items (unchanged), worker_documents (none created by this walk).
// Residue: the instruction message row → delete via MCP afterwards.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const PERSON = "E2E Worker Two";
const PROJECT = "E2E Vilniaus objektas (testinis)";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-ledger"); fs.mkdirSync(OUT, { recursive: true });
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
  const t0 = Date.now();
  // M1 — an instruction for the person on this project
  const m = await open(MANAGER, { width: 1280, height: 900 }, "/lt/dashboard");
  await m.getByTestId("composer-input").waitFor({ timeout: 90000 });
  await say(m, `kas trūksta projektui ${PROJECT}?`, /Parengtis|Dokumentų sąrašas/);
  const askBtn = m.getByRole("button", { name: `Paprašyti: ${PERSON}`, exact: true });
  let asked = false;
  if ((await askBtn.count()) > 0) { await askBtn.last().click(); await m.waitForTimeout(10000); asked = /Nurodymas išsiųstas/.test(await m.locator("body").innerText()); }
  log({ step: "M1_instruction", asked });
  // W1 — the ledger on the instructions page
  const w = await open(WORKER, { width: 390, height: 844 }, "/lt/dashboard/instructions");
  await w.getByTestId("worker-instruction-card").first().waitFor({ timeout: 60000 });
  await w.waitForTimeout(3000);
  const ratio = w.getByTestId("instruction-ledger-ratio").first();
  const hasRatio = (await ratio.count()) > 0;
  const have = hasRatio ? await ratio.getAttribute("data-have") : null;
  const total = hasRatio ? await ratio.getAttribute("data-total") : null;
  const rows = await w.locator('[data-testid^="instruction-ledger-row"], [data-testid="instruction-project-ask"]').allInnerTexts();
  const states = await w.locator("[data-state]").evaluateAll((els) => els.map((e) => e.getAttribute("data-state")).filter(Boolean).slice(0, 12));
  const links = await w.getByRole("link", { name: /Įrašyti dokumentą|Įrašyti|dokumentų|Paprašyti|kursas|paslauga/i }).allInnerTexts();
  log({ step: "W1_ledger", hasRatio, have, total, rows: rows.slice(0, 8).map((r) => r.replace(/\s+/g, " ").slice(0, 140)), states, links: links.slice(0, 8) });
  await w.screenshot({ path: path.join(OUT, "01-ledger.png"), fullPage: true });
  const rec = w.getByRole("link", { name: /Įrašyti dokumentą/ }).first();
  if ((await rec.count()) > 0) {
    const href = await rec.getAttribute("href");
    await rec.click(); await w.waitForTimeout(6000);
    log({ step: "W1_record_link", href, landed: w.url(), prefilled: /type=|tipas|dokument/i.test(w.url()) });
    await w.screenshot({ path: path.join(OUT, "02-record-target.png") });
  } else {
    log({ step: "W1_record_link", none: true });
  }
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0, readback: "select item_key, status from project_worker_readiness_items where worker_id='0dbd5eda-59b3-4f89-8d8e-01f41a542bd2' and project_id='3b9c55d3-0fc1-40ac-9576-7937be41a55c'; select id, created_at, left(body,60) from conversation_messages where project_id='3b9c55d3-0fc1-40ac-9576-7937be41a55c' and created_at > now() - interval '30 minutes'" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
