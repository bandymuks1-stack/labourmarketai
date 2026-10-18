// PRODUCTION PERFORMANCE / HYGIENE WALK — Lane H, window 6 (2026-09-06). READ-ONLY.
//
// Measures, against production with the bounded E2E identities:
//   * launch-critical pages: time to DOMContentLoaded / load, server TTFB (Navigation
//     Timing), failed requests (status >= 400), console errors, largest responses;
//   * mobile 390 px: horizontal overflow, primary controls under 40 px, clipped text,
//     raw UUIDs shown to the person;
//   * the conversation: time to the first answer for "ieškau darbo" and
//     "ką man daryti toliau?"; the employer sentence → need form;
//   * anonymous API probes (fetch, no cookie): does any route answer with tenant data?
// Nothing is submitted, no row is created. Output: JSON lines on stdout; screenshots
// beside this file.
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/perf-hygiene/perf-walk-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const LEARNER = "e2e-learner-202609021634@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = __dirname;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const PAGE_PROBE = `(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const timing = nav ? { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize } : null;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const short = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 40);
  const iw = window.innerWidth;
  const overflow = document.documentElement.scrollWidth > iw + 1;
  const overflowers = [];
  if (overflow) for (const el of document.querySelectorAll("body *")) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > iw + 1 && overflowers.length < 6) overflowers.push(el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40) + " " + short(el)); }
  const smallButtons = [], smallLinks = [];
  for (const el of document.querySelectorAll("button, [role=button], input:not([type=hidden]), select, textarea, a[href]")) {
    if (!vis(el)) continue; if (el.closest("[hidden]")) continue;
    const r = el.getBoundingClientRect(); if (r.height >= 40 && r.width >= 40) continue;
    const item = el.tagName.toLowerCase() + " " + Math.round(r.width) + "x" + Math.round(r.height) + " " + short(el);
    (el.tagName === "A" ? smallLinks : smallButtons).push(item);
  }
  const clipped = [];
  for (const el of document.querySelectorAll("body *")) {
    if (clipped.length >= 8) break;
    if (!el.innerText || !el.innerText.trim()) continue;
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflowX) && !/hidden|clip/.test(cs.overflow)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && vis(el)) clipped.push(el.tagName.toLowerCase() + " " + (cs.textOverflow === "ellipsis" ? "[ellipsis] " : "") + short(el));
  }
  const text = document.body.innerText || "";
  const uuids = []; let m; const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  while ((m = re.exec(text)) && uuids.length < 5) uuids.push(text.slice(Math.max(0, m.index - 30), m.index + 36).replace(/\\s+/g, " "));
  const h1 = (document.querySelector("h1") || {}).innerText || "";
  return { timing, overflow, overflowers, smallButtons: smallButtons.slice(0, 10), smallButtonCount: smallButtons.length, smallLinkCount: smallLinks.length, smallLinks: smallLinks.slice(0, 6), clipped, uuidCount: (text.match(re) || []).length, uuids, h1: h1.slice(0, 80), textLength: text.length };
})()`;

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

  // ── anonymous probes: no cookie, no bearer ────────────────────────────────
  {
    const probes = [
      ["GET", "/api/dashboard-search?q=darbas"],
      ["GET", "/api/workers/0dbd5eda-59b3-4f89-8d8e-01f41a542bd2/skills"],
      ["POST", "/api/workers/0dbd5eda-59b3-4f89-8d8e-01f41a542bd2/skills", '{"skills":[]}'],
      ["GET", "/api/professions/fb5aaeaf-afe2-48cd-9e24-c4efe4d9ca86/skills"],
      ["GET", "/api/documents/file/beeb0ce6-72fa-4fdd-b572-2f255676e2e4"],
      ["GET", "/api/billing/reconcile"],
      ["POST", "/api/billing/portal", "{}"],
      ["POST", "/api/cv/extract", ""],
      ["GET", "/api/mcp"],
      ["GET", "/api/cron/weekly-digest"],
      ["GET", "/lt/jobs"],
      ["GET", "/lt/jobs?page=3"],
      ["GET", "/lt"],
    ];
    for (const [method, p, body] of probes) {
      const t0 = Date.now();
      try {
        const r = await fetch(HOST + p, { method, redirect: "manual", headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body || undefined });
        const text = await r.text();
        log({ probe: method + " " + p, status: r.status, ms: Date.now() - t0, bytes: text.length, location: r.headers.get("location"), head: text.replace(/\s+/g, " ").slice(0, 160), uuids: (text.match(UUID) || []).length, emails: (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).slice(0, 3) });
      } catch (e) { log({ probe: method + " " + p, error: String(e).slice(0, 120) }); }
    }
  }

  const b = await chromium.launch();
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    return c;
  };

  const measure = async (c, who, route, opts = {}) => {
    const p = await c.newPage();
    const failed = [], errors = [], sizes = [];
    p.on("response", async (r) => {
      const u = r.url().replace(HOST, "");
      if (r.status() >= 400) failed.push(r.status() + " " + u.slice(0, 100));
      if (!r.url().startsWith(HOST)) return;
      const cl = Number(r.headers()["content-length"] || 0);
      if (cl > 0) sizes.push([cl, u.slice(0, 90)]);
      else if (sizes.length < 60) { try { const bb = await r.body(); sizes.push([bb.length, u.slice(0, 90)]); } catch {} }
    });
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 140)); });
    p.on("pageerror", (e) => errors.push("pageerror " + String(e.message).slice(0, 140)));
    const t0 = Date.now();
    let dclMs = -1, loadMs = -1, readyMs = -1;
    try {
      await p.goto(HOST + route, { waitUntil: "domcontentloaded", timeout: 60000 }); dclMs = Date.now() - t0;
      await p.waitForLoadState("load", { timeout: 60000 }).catch(() => {}); loadMs = Date.now() - t0;
      if (opts.ready) { await p.getByTestId(opts.ready).waitFor({ timeout: 60000 }).catch(() => {}); readyMs = Date.now() - t0; }
      await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    } catch (e) { errors.push("goto " + String(e.message).slice(0, 100)); }
    const probe = await p.evaluate(PAGE_PROBE).catch((e) => ({ probeError: String(e).slice(0, 100) }));
    sizes.sort((a, b2) => b2[0] - a[0]);
    const label = opts.label || route;
    log({ page: label, who, viewport: p.viewportSize().width, finalUrl: p.url().replace(HOST, ""), wall: { dcl: dclMs, load: loadMs, ready: readyMs }, ...probe, failed: failed.slice(0, 8), failedCount: failed.length, consoleErrors: errors.slice(0, 5), consoleErrorCount: errors.length, largest: sizes.slice(0, 4) });
    if (opts.shot) await p.screenshot({ path: path.join(OUT, opts.shot + ".png"), fullPage: false }).catch(() => {});
    return p;
  };

  const ask = async (p, sentence, maxMs = 45000) => {
    const assistantBefore = await p.getByTestId("msg-assistant").count();
    const resultsBefore = await p.getByTestId("msg-result").count();
    const t0 = Date.now();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    let firstAnswerMs = -1;
    while (Date.now() - t0 < maxMs) {
      await p.waitForTimeout(500);
      const typing = await p.getByTestId("chat-typing").count();
      const grew = (await p.getByTestId("msg-assistant").count()) > assistantBefore || (await p.getByTestId("msg-result").count()) > resultsBefore;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    await p.waitForTimeout(4000);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    return { sentence, text: text.slice(0, 220), results, firstAnswerMs };
  };

  // ── WORKER, mobile 390 ────────────────────────────────────────────────────
  {
    const c = await open(WORKER, { width: 390, height: 844 });
    let p = await measure(c, "worker", "/lt/dashboard", { label: "/lt/dashboard COLD", ready: "composer-input", shot: "01-worker-dashboard-390" });
    await p.close();
    p = await measure(c, "worker", "/lt/dashboard", { label: "/lt/dashboard WARM", ready: "composer-input" });
    const a1 = await ask(p, "ieškau darbo"); log({ conversation: "worker", ...a1 });
    await p.screenshot({ path: path.join(OUT, "02-worker-ieskau-darbo-390.png"), fullPage: false }).catch(() => {});
    const a2 = await ask(p, "ką man daryti toliau?"); log({ conversation: "worker", ...a2 });
    await p.screenshot({ path: path.join(OUT, "03-worker-ka-toliau-390.png"), fullPage: false }).catch(() => {});
    await p.close();
    for (const r of ["/lt/dashboard/profile", "/lt/dashboard/journal", "/lt/dashboard/opportunities", "/lt/dashboard/learning", "/lt/dashboard/services", "/lt/dashboard/projects", "/lt/dashboard/documents"]) {
      const pg = await measure(c, "worker", r, { shot: "w-" + r.replace(/\//g, "_") + "-390" }); await pg.close();
    }
    await c.close();
  }

  // ── COMPANY, desktop 1280 ─────────────────────────────────────────────────
  {
    const c = await open(COMPANY, { width: 1280, height: 800 });
    let p = await measure(c, "company", "/lt/dashboard", { label: "/lt/dashboard COLD", ready: "composer-input" });
    await p.close();
    p = await measure(c, "company", "/lt/dashboard", { label: "/lt/dashboard WARM", ready: "composer-input" });
    const t0 = Date.now();
    const a = await ask(p, "reikia 2 mūrininkų Vilniuje nuo spalio");
    await p.getByTestId("field-role").waitFor({ timeout: 30000 }).catch(() => {});
    const role = await p.getByTestId("field-role").inputValue().catch(() => null);
    log({ conversation: "company need form", ...a, formVisibleMs: Date.now() - t0, role });
    await p.screenshot({ path: path.join(OUT, "04-company-need-form-1280.png"), fullPage: false }).catch(() => {});
    await p.close();
    for (const r of ["/lt/dashboard/company", "/lt/dashboard/candidates", "/lt/dashboard/projects", "/lt/dashboard/service-requests", "/lt/dashboard/learning"]) {
      const pg = await measure(c, "company", r, {}); await pg.close();
    }
    // the company's pages at 390 too — the employer on a phone
    const m = await open(COMPANY, { width: 390, height: 844 });
    for (const r of ["/lt/dashboard/company", "/lt/dashboard/candidates"]) {
      const pg = await measure(m, "company", r, { shot: "c-" + r.replace(/\//g, "_") + "-390" }); await pg.close();
    }
    await m.close();
    await c.close();
  }

  // ── LEARNER, mobile 390 ───────────────────────────────────────────────────
  {
    const c = await open(LEARNER, { width: 390, height: 844 });
    let p = await measure(c, "learner", "/lt/dashboard", { label: "/lt/dashboard COLD", ready: "composer-input", shot: "05-learner-dashboard-390" });
    const a = await ask(p, "ką man mokytis?"); log({ conversation: "learner", ...a });
    await p.close();
    p = await measure(c, "learner", "/lt/dashboard/learning", { shot: "06-learner-learning-390" }); await p.close();
    await c.close();
  }

  await b.close();
  log({ result: "DONE" });
})().catch((e) => { log({ fatal: String(e && e.stack || e).slice(0, 400) }); process.exit(1); });
