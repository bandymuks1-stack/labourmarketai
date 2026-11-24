/**
 * walk-drilldown-people-prod.cjs — L1 finding: the World/market drilldown's people-continuation panel must name the
 * PROJECT (title), never a raw id under "Projekto ID" (#1553). Signed-in spine org identity; depth lives in the URL:
 * /lt/dashboard?result=market&geo=<token> → project row → evaluation → "continue-to-people" → panel fields.
 * Usage: EXPECT_BUILD=<sha7> node walk-drilldown-people-prod.cjs
 */
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-drilldown-people"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
const ORG_EMAIL = "e2e-spine-org-202609051508@labourmarket.ai";
const GEOS = ["LT:city:Vilnius", "NL:city:Rotterdam", "LT:country", "NL:country"];
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: ORG_EMAIL }); if (error) throw error;
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess, error: v } = await anon.auth.verifyOtp({ email: ORG_EMAIL, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const body = async () => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  let done = false;
  for (const geo of GEOS) {
    await p.goto(HOST + "/lt/dashboard?result=market&geo=" + encodeURIComponent(geo), { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await Promise.race([p.getByTestId("projects-list").waitFor({ timeout: 30000 }), p.getByTestId("projects-empty").waitFor({ timeout: 30000 }), p.getByTestId("projects-unsupported-precision").waitFor({ timeout: 30000 })]).catch(() => {});
    const rows = await p.getByTestId("project-row").count();
    log({ step: "projects_view", geo, rows, empty: (await p.getByTestId("projects-empty").count()) > 0, count: await p.getByTestId("projects-count").innerText().catch(() => null) });
    if (rows === 0) continue;
    const title = (await p.getByTestId("project-row").first().innerText()).replace(/\s+/g, " ").slice(0, 120);
    await p.getByTestId("project-row").first().click();
    await p.getByTestId("project-evaluation").waitFor({ timeout: 30000 });
    await Promise.race([p.getByTestId("continue-to-people").waitFor({ timeout: 30000 }), p.getByTestId("evaluation-not-found").waitFor({ timeout: 30000 })]).catch(() => {});
    if ((await p.getByTestId("continue-to-people").count()) === 0) { log({ step: "evaluation", geo, continueBtn: false, url: p.url() }); continue; }
    await p.getByTestId("continue-to-people").click();
    await p.getByTestId("people-continuation").waitFor({ timeout: 15000 });
    const panel = (await p.getByTestId("people-continuation").innerText()).replace(/\s+/g, " ");
    const uuidInPanel = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(panel);
    log({ step: "people_panel", geo, url: p.url(), rowTitle: title, panel: panel.slice(0, 500), hasProjektoID: /Projekto ID/.test(panel), hasProjektasLabel: /Projektas/.test(panel), rawUuidShown: uuidInPanel, pass: !/Projekto ID/.test(panel) && !uuidInPanel && /Projektas/.test(panel) });
    await p.screenshot({ path: path.join(OUT, "people-panel.png"), fullPage: true });
    done = true; break;
  }
  if (!done) log({ step: "no_project_reachable", note: "no geography in the list had a project with an evaluation; nothing asserted", body: (await body()).slice(0, 300) });
  await b.close();
  log({ step: "done" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
