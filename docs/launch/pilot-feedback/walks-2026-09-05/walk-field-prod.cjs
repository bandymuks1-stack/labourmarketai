// Production walk — P4 FIELD subset (#1530) on the operations page of "E2E Vilniaus objektas (testinis)":
//  F1 the Field is the first section; lanes / tokens / slots / ready counted;
//  F2 select the token (E2E Worker Two) → context with the readiness rows;
//  F3 "Mark received" on the first row → re-read → the row reads `received`; MCP readback of the SAME row;
//  F4 "Still needed" → readback restores `needed` (no residue);
//  F5 List toggle renders the same objects.
// Residue: none when F4 completes; if it fails, restore via MCP:
//   update project_worker_readiness_items set status='needed' where worker_id='0dbd5eda-59b3-4f89-8d8e-01f41a542bd2' and project_id='3b9c55d3-0fc1-40ac-9576-7937be41a55c';
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const PROJECT_ID = "3b9c55d3-0fc1-40ac-9576-7937be41a55c";
const WORKER_ID = "0dbd5eda-59b3-4f89-8d8e-01f41a542bd2";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-field"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const readiness = async () => {
    // service_role has no grant on this table (narrow grants) — the DB readback is done via MCP after the walk.
    const { data, error } = await admin.from("project_worker_readiness_items").select("item_key,status").eq("worker_id", WORKER_ID).eq("project_id", PROJECT_ID).order("item_key");
    if (error) return { unavailable: error.message }; return data;
  };
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const before = await readiness();
  log({ step: "readback_before", rows: before });
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(MANAGER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const t0 = Date.now();
  await p.goto(`https://labourmarket.ai/lt/dashboard/projects/${PROJECT_ID}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const field = p.getByTestId("project-field");
  await field.waitFor({ timeout: 90000 });
  await p.waitForTimeout(2000);
  const firstSectionIsField = await p.evaluate(() => {
    const f = document.querySelector('[data-testid="project-field"]');
    if (!f) return false;
    const main = f.closest("main") || document.body;
    const sections = Array.from(main.querySelectorAll("section, [data-testid]")).filter((el) => el.getBoundingClientRect().height > 40);
    return sections.length > 0 && (sections[0] === f || sections[0].contains(f));
  });
  const counts = {
    lanes: await p.getByTestId("project-field-lane").count(),
    tokens: await p.getByTestId("project-field-token").count(),
    slots: await p.getByTestId("project-field-slot").count(),
    ready: await p.getByTestId("project-field-ready").count(),
    unplaced: await p.getByTestId("project-field-unplaced").count(),
  };
  const meta = (await p.getByTestId("project-field-meta").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 160));
  const laneTexts = (await p.getByTestId("project-field-lane").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 120));
  const tokenTexts = (await p.getByTestId("project-field-token").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 120));
  const slotTexts = (await p.getByTestId("project-field-slot").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 120));
  const laterSections = await p.evaluate(() => /Gantt|Pasas|Ekonomika|Defekt|Lenta|Etapai/i.test(document.body.innerText));
  log({ step: "F1_field", firstSectionIsField, counts, meta, laneTexts, tokenTexts, slotTexts, laterSectionsStillPresent: laterSections });
  await p.screenshot({ path: path.join(OUT, "01-field.png"), fullPage: true });
  // F2 — select the token
  const token = p.getByTestId("project-field-token").filter({ hasText: /Worker Two/ }).first();
  if ((await token.count()) === 0) throw new Error("token E2E Worker Two not on the Field");
  await token.click();
  const ctx = p.getByTestId("project-field-context-token");
  await ctx.waitFor({ timeout: 15000 });
  const rows = p.getByTestId("project-field-readiness-row");
  const rowCount = await rows.count();
  const rowStatuses = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  const ctxText = (await ctx.innerText()).replace(/\s+/g, " ").slice(0, 400);
  log({ step: "F2_context", rowCount, rowStatuses, ctxText });
  await p.screenshot({ path: path.join(OUT, "02-context.png"), fullPage: true });
  // F3 — Mark received on the first row
  const row0 = rows.first();
  const label0 = (await row0.locator("span").first().innerText()).trim();
  await row0.getByTestId("project-field-mark-received").click();
  let statusAfter = null;
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(1500);
    const r = p.getByTestId("project-field-readiness-row").filter({ hasText: label0 }).first();
    statusAfter = await r.getAttribute("data-status");
    if (statusAfter === "received") break;
  }
  const noteText = (await p.getByTestId("project-field-note").allInnerTexts()).join(" | ").replace(/\s+/g, " ").slice(0, 200);
  const mid = await readiness();
  log({ step: "F3_mark_received", row: label0, uiStatus: statusAfter, note: noteText, dbReceived: Array.isArray(mid) ? mid.filter((r) => r.status === "received").map((r) => r.item_key) : mid });
  await p.screenshot({ path: path.join(OUT, "03-received.png"), fullPage: true });
  // F4 — Still needed restores
  const rowAgain = p.getByTestId("project-field-readiness-row").filter({ hasText: label0 }).first();
  await rowAgain.getByTestId("project-field-mark-needed").click();
  let restored = null;
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(1500);
    restored = await p.getByTestId("project-field-readiness-row").filter({ hasText: label0 }).first().getAttribute("data-status");
    if (restored === "needed") break;
  }
  const after = await readiness();
  log({ step: "F4_restore", uiStatus: restored, dbAllNeeded: Array.isArray(after) ? after.every((r) => r.status === "needed") : after, rows: after });
  // F5 — List toggle
  const listBtn = p.getByRole("button", { name: /Sąrašas|List/i }).first();
  let list = null;
  if ((await listBtn.count()) > 0) {
    await listBtn.click(); await p.waitForTimeout(1000);
    list = {
      visible: await p.getByTestId("project-field-list").isVisible().catch(() => false),
      lanes: await p.getByTestId("project-field-lane").count(),
      tokens: await p.getByTestId("project-field-token").count(),
      slots: await p.getByTestId("project-field-slot").count(),
      ready: await p.getByTestId("project-field-ready").count(),
    };
    await p.screenshot({ path: path.join(OUT, "04-list.png"), fullPage: true });
  }
  log({ step: "F5_list", list });
  // 390 px
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT" })).newPage();
  await m.context().addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(MANAGER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  await m.goto(`https://labourmarket.ai/lt/dashboard/projects/${PROJECT_ID}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await m.getByTestId("project-field").waitFor({ timeout: 90000 });
  await m.waitForTimeout(1500);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log({ step: "F6_mobile", horizontalOverflowPx: overflow });
  await m.screenshot({ path: path.join(OUT, "05-mobile.png"), fullPage: true });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
