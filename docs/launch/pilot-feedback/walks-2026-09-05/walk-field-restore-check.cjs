// Targeted re-check of Field step F4 (#1530): received -> "Still needed" must re-render `needed` after the re-read.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const PROJECT_ID = "3b9c55d3-0fc1-40ac-9576-7937be41a55c";
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-field"); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: MANAGER });
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess } = await anon.auth.verifyOtp({ email: MANAGER, token: link.properties.email_otp, type: "magiclink" });
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const msgs = [];
  p.on("console", (m) => { if (m.type() === "error") msgs.push(m.text().slice(0, 200)); });
  await p.goto(`https://labourmarket.ai/lt/dashboard/projects/${PROJECT_ID}/operations`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("project-field").waitFor({ timeout: 90000 });
  await p.getByTestId("project-field-token").filter({ hasText: /Worker Two/ }).first().click();
  await p.getByTestId("project-field-context-token").waitFor({ timeout: 15000 });
  const row = () => p.getByTestId("project-field-readiness-row").filter({ hasText: "A1 / komandiravimo" }).first();
  log({ step: "fresh_load_status", status: await row().getAttribute("data-status") });
  const t = Date.now();
  await row().getByTestId("project-field-mark-received").click();
  let s = null; for (let i = 0; i < 20; i++) { await p.waitForTimeout(1000); s = await row().getAttribute("data-status"); if (s === "received") break; }
  log({ step: "after_received", status: s, ms: Date.now() - t, message: (await p.getByTestId("project-field-note").allInnerTexts()).join("|").slice(0, 120) });
  const t2 = Date.now();
  const btn = row().getByTestId("project-field-mark-needed");
  log({ step: "needed_button", count: await btn.count(), disabled: (await btn.count()) ? await btn.isDisabled() : null });
  await btn.click();
  let s2 = null; for (let i = 0; i < 30; i++) { await p.waitForTimeout(1000); s2 = await row().getAttribute("data-status"); if (s2 === "needed") break; }
  await p.screenshot({ path: path.join(OUT, "06-after-needed.png"), fullPage: true });
  log({ step: "after_needed", status: s2, ms: Date.now() - t2, consoleErrors: msgs.slice(0, 5) });
  if (s2 !== "needed") { await p.reload({ waitUntil: "domcontentloaded" }); await p.getByTestId("project-field").waitFor({ timeout: 90000 }); await p.getByTestId("project-field-token").filter({ hasText: /Worker Two/ }).first().click(); await p.getByTestId("project-field-context-token").waitFor({ timeout: 15000 }); log({ step: "after_reload", status: await row().getAttribute("data-status") }); }
  await b.close();
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
