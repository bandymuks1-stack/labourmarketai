// Production walk — P5/C1 subset (#1532): the organisation's home operates WITHOUT the composer.
//  C1 /lt/dashboard/company → [company-home-field] present under the header; the blocks that rendered are listed;
//  C2 the Vilnius project row → "Open operations" → /dashboard/projects/<id>/operations;
//  C3 who-is-free → "Put on a project" href; C4 missing → "Describe a need" anchor / "Open the need" href;
//  C5 needs-you chips → hrefs (never the chat); C6 390 px: no horizontal overflow.
// Residue: none (reads + navigation only).
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const PROJECT_ID = "3b9c55d3-0fc1-40ac-9576-7937be41a55c";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-company-home"); fs.mkdirSync(OUT, { recursive: true });
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
  const open = async (viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(MANAGER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("company-home-field").waitFor({ timeout: 90000 });
    await p.waitForTimeout(2000);
    return p;
  };
  const t0 = Date.now();
  const p = await open({ width: 1280, height: 900 });
  const present = await p.evaluate(() => Array.from(document.querySelectorAll('[data-testid^="company-home-"]')).map((e) => e.getAttribute("data-testid")).reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {}));
  const noComposer = (await p.getByTestId("composer-input").count()) === 0;
  const fieldText = (await p.getByTestId("company-home-field").innerText()).replace(/\s+/g, " ").slice(0, 900);
  log({ step: "C1_home", present, noComposerOnPage: noComposer, fieldText });
  await p.screenshot({ path: path.join(OUT, "01-home.png"), fullPage: true });
  const hrefs = async (testid) => p.getByTestId(testid).evaluateAll((els) => els.map((e) => e.getAttribute("href") || (e.querySelector("a") && e.querySelector("a").getAttribute("href")) || null));
  const links = {
    projectOpen: await hrefs("company-home-project-open"),
    projectOperations: await hrefs("company-home-project-operations"),
    projectInvite: await hrefs("company-home-project-invite"),
    capacityAssign: await hrefs("company-home-capacity-assign"),
    capacityInvite: await hrefs("company-home-capacity-invite"),
    needNew: await hrefs("company-home-need-new"),
    needOpen: await hrefs("company-home-need-open"),
    needContinue: await hrefs("company-home-need-continue"),
    attentionLines: await hrefs("company-home-attention-line"),
    partnersInvite: await hrefs("company-home-partners-invite"),
    rolesEdit: await hrefs("company-home-roles-edit"),
  };
  const projectRows = (await p.getByTestId("company-home-project-open").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 100));
  const derived = (await p.getByTestId("company-home-next-derived").allInnerTexts()).map((s) => s.replace(/\s+/g, " ").slice(0, 120));
  const chatLinks = Object.values(links).flat().filter((h) => h && /say=|intent=|\/dashboard\/?(\?|$)/.test(h));
  log({ step: "C2_links", links, projectRows, derived, linksIntoTheChat: chatLinks });
  // C2 — Open operations for the Vilnius project
  const ops = p.getByTestId("company-home-project-operations").filter({ has: p.locator(`[href*="${PROJECT_ID}"]`) }).first();
  const opsSelf = (await ops.count()) > 0 ? ops : p.locator(`[data-testid="company-home-project-operations"][href*="${PROJECT_ID}"]`).first();
  let opsLanded = null;
  if ((await opsSelf.count()) > 0) { await opsSelf.click(); await p.waitForTimeout(5000); opsLanded = p.url(); }
  log({ step: "C3_open_operations", landed: opsLanded, isOperations: !!opsLanded && /\/operations/.test(opsLanded) && opsLanded.includes(PROJECT_ID) });
  await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  // C4 — "Describe a need" scrolls to the demand form (same page anchor)
  await p.getByTestId("company-home-field").waitFor({ timeout: 60000 }).catch(() => {});
  const needNew = p.getByTestId("company-home-need-new").first();
  let anchor = null;
  if ((await needNew.count()) > 0) {
    anchor = await needNew.getAttribute("href");
    await needNew.click(); await p.waitForTimeout(1500);
    const hashAfter = new URL(p.url()).hash;
    const target = anchor && anchor.includes("#") ? anchor.slice(anchor.indexOf("#") + 1) : null;
    const targetVisible = target ? await p.locator("#" + target).first().isVisible().catch(() => false) : null;
    log({ step: "C4_describe_need", anchor, hashAfter, targetVisible });
  } else {
    log({ step: "C4_describe_need", none: true });
  }
  // C6 — 390 px
  const m = await open({ width: 390, height: 844 });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const fieldBox = await m.getByTestId("company-home-field").boundingBox();
  log({ step: "C6_mobile", horizontalOverflowPx: overflow, fieldWidth: fieldBox && Math.round(fieldBox.width) });
  await m.screenshot({ path: path.join(OUT, "02-mobile.png"), fullPage: true });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
