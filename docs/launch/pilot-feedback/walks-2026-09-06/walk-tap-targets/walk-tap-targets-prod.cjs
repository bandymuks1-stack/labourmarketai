// PRODUCTION WALK — mobile tap targets (window 6, lane P0-G, PR fix/cc/w6-mobile-tap-targets).
//
// WHAT IT MEASURES against production, read-only, with bounded E2E identities, at 390 px:
//   every VISIBLE interactive control (button, a[href], input[type=checkbox|radio],
//   [role=button]) whose bounding box is under 40 px tall OR under 40 px wide, on
//     WORKER  /lt/dashboard/journal, /opportunities, /documents, /services, /inbox/quick
//     COMPANY /lt/dashboard/company, /inbox/quick
//   For checkboxes/radios the tap area is the LABEL that wraps them (or the element
//   referenced by <label for>), because that is what the finger hits; the visual box may
//   stay small by design.
//
// Output: one JSON line per page ({ page, who, small: [...] }) plus a markdown table
// (walk-tap-targets-<build>.md) and a full-page screenshot per page in this folder.
// PASS = zero small PRIMARY controls (buttons, role=button, checkbox/radio tap areas).
// Links inside running text (a[href] in a <p>/<li>) are listed but do not fail the walk.
//
// Read-only: nothing is clicked, no form is submitted, no row is created.
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-tap-targets/walk-tap-targets-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = __dirname;
const MIN = 40;

const PAGES = [
  { who: "worker", email: WORKER, paths: ["/lt/dashboard/journal", "/lt/dashboard/opportunities", "/lt/dashboard/documents", "/lt/dashboard/services", "/lt/dashboard/inbox/quick"] },
  { who: "company", email: COMPANY, paths: ["/lt/dashboard/company", "/lt/dashboard/inbox/quick"] },
];

// Runs in the page. Reports every small control with enough identity to grep its origin.
const PROBE = `(() => {
  const MIN = ${MIN};
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
  const short = (el) => (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("name") || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 48);
  // The tap area of a checkbox/radio is its wrapping <label> (or the <label for=id>).
  const tapArea = (el) => {
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      const lab = el.closest("label") || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
      if (lab && vis(lab)) return { node: lab, via: "label" };
    }
    return { node: el, via: "self" };
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("button, [role=button], a[href], input[type=checkbox], input[type=radio]")) {
    if (!vis(el)) continue; if (el.closest("[hidden],[aria-hidden=true]")) continue;
    if (el.closest(".leaflet-container")) continue; // third-party map chrome, not product controls
    const { node, via } = tapArea(el);
    const r = node.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w >= MIN && h >= MIN) continue;
    const inProse = el.tagName === "A" && !!el.closest("p, li, td");
    const key = el.tagName + "|" + short(el) + "|" + w + "x" + h + "|" + String(el.className).slice(0, 60);
    if (seen.has(key)) continue; seen.add(key);
    out.push({
      tag: el.tagName.toLowerCase() + (el.type && el.tagName === "INPUT" ? "[" + el.type + "]" : ""),
      text: short(el) || (via === "label" ? short(node) : ""),
      w, h, via, primary: !inProse,
      testid: el.getAttribute("data-testid") || node.getAttribute("data-testid") || "",
      cls: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 110),
      tapCls: via === "label" ? String(node.className).slice(0, 80) : "",
    });
  }
  return { total: out.length, primary: out.filter((x) => x.primary).length, small: out };
})()`;

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const BUILD = String(health.build).slice(0, 8);

  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();
  const rows = [];
  let primaryTotal = 0;
  for (const { who, email, paths } of PAGES) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT", isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    for (const pth of paths) {
      const p = await c.newPage();
      const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "").slice(0, 80)); });
      let nav = "ok";
      await p.goto(HOST + pth, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => { nav = String(e.message).slice(0, 80); });
      await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(4000); // let client islands hydrate (chips, sheets)
      const probe = await p.evaluate(PROBE).catch((e) => ({ error: String(e.message).slice(0, 120), total: 0, primary: 0, small: [] }));
      const name = who[0] + "-" + pth.replace(/\//g, "_") + "-390";
      await p.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }).catch(() => {});
      log({ page: pth, who, nav, finalUrl: p.url().replace(HOST, ""), total: probe.total, primary: probe.primary, error: probe.error, failed: failed.slice(0, 4) });
      for (const s of probe.small) { log({ page: pth, who, ...s }); rows.push({ page: pth, who, ...s }); }
      primaryTotal += probe.primary;
      await p.close();
    }
    await c.close();
  }
  await b.close();

  // Markdown table for the log.
  const md = ["# Tap targets < " + MIN + " px at 390 px — production build " + BUILD + " (" + new Date().toISOString() + ")", "",
    "| who | page | control | text | size | tap via | primary | testid | class (origin grep) |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of rows) md.push("| " + [r.who, r.page, r.tag, r.text.replace(/\|/g, "/"), r.w + "x" + r.h, r.via, r.primary ? "yes" : "prose link", r.testid, "`" + r.cls.replace(/\|/g, "/").slice(0, 90) + "`"].join(" | ") + " |");
  md.push("", "Primary controls under " + MIN + " px: **" + primaryTotal + "**. Prose links: " + rows.filter((r) => !r.primary).length + ".");
  fs.writeFileSync(path.join(OUT, "walk-tap-targets-" + BUILD + ".md"), md.join("\n") + "\n");
  log({ result: primaryTotal === 0 ? "PASS" : "FAIL", primaryUnderMin: primaryTotal, rows: rows.length, build: BUILD });
  process.exit(primaryTotal === 0 ? 0 : 1);
})().catch((e) => { log({ fatal: String(e && e.stack || e).slice(0, 400) }); process.exit(1); });
