// PRODUCTION WALK — the market drilldown reaches REAL canonical demand (L1 people-panel finding).
//
// WHAT IT PROVES, end to end, against production, with no writes:
//   1. a real employer identity opens the market result and the map carries a REAL marker for
//      the country its own persisted need is in (the need was created 2026-09-04 through the
//      proven employer flow: customer_requests b0a48f65…, LT, welder, team_size 2);
//   2. clicking that marker opens depth 1 and the list is NOT empty — before this fix the
//      drilldown read `job_demands` (0 rows in production for its whole life), so every marker
//      opened onto "there are no open needs here" and depth 2 was unreachable for every user;
//   3. the row is the CANONICAL row: its address is the customer_requests id, its unit-kind
//      badge says "open need", and the headcount is the employer's own stated number;
//   4. depth 2 (the evaluation) opens on that id and states its source honestly;
//   5. the continuation to people is REACHABLE and carries the real context — the panel the
//      finding said real users could not get to;
//   6. TENANT ISOLATION still holds: a different employer identity, given the SAME hand-typed
//      depth-2 URL, is answered "not found", not with another tenant's need.
//
// Read-only: no row is created, updated or deleted. Nothing to clean up.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-05/walk-market-drilldown-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");

const EMPLOYER = "e2e-walker-202609021438@labourmarket.ai";       // owns the LT need below
const OTHER_TENANT = "e2e-spine-org-202609051508@labourmarket.ai"; // owns none of it
const NEED_ID = "b0a48f65-6152-40eb-8080-986f87dca211";
const NEED_ROLE = "welder";
const NEED_HEADCOUNT = 2;
const GEO = "LT%3Acountry"; // the need carries no city, so it is in the approximate country aggregate

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-market-drilldown"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };

(async () => {
  const health = await (await fetch("https://labourmarket.ai/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);

  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

  // PRE-FLIGHT: the walk asserts against a row that must still be there and still be canonical.
  const pre = await admin.from("customer_requests")
    .select("id, status, country, location, team_size, role_or_work_type").eq("id", NEED_ID).single();
  if (pre.error) throw pre.error;
  log({ step: "preflight_need", row: pre.data });
  must("preflight: the need is still submitted, LT, city-less", pre.data.status === "submitted" && pre.data.country === "LT" && !pre.data.location);

  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();
  const open = async (email, to) => {
    const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const consoleErrors = [], failedRequests = [];
    p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    p.on("response", (r) => { if (r.status() >= 400) failedRequests.push(r.status() + " " + r.url()); });
    await p.goto("https://labourmarket.ai" + to, { waitUntil: "domcontentloaded", timeout: 60000 });
    return { p, consoleErrors, failedRequests };
  };
  const t0 = Date.now();

  // ── 1. the market result, as the employer who owns the need ────────────────
  const { p, consoleErrors, failedRequests } = await open(EMPLOYER, "/lt/dashboard?result=market");
  await p.getByTestId("market-map").waitFor({ timeout: 90000 });
  const anchors = await p.locator("[data-anchor-id]").evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute("data-anchor-id"), precision: e.getAttribute("data-anchor-precision") })));
  log({ step: "market", ms: Date.now() - t0, anchors });
  const lt = anchors.find((a) => (a.id || "").startsWith("LT"));
  must("the map carries a REAL marker for the country of the persisted need", !!lt, lt);
  await p.screenshot({ path: path.join(OUT, "01-market.png") });

  // ── 2. depth 1 — the drilldown is no longer empty ──────────────────────────
  if (lt) await p.locator(`[data-anchor-id="${lt.id}"]`).first().click();
  else await p.goto(`https://labourmarket.ai/lt/dashboard?result=market&geo=${GEO}`, { waitUntil: "domcontentloaded" });
  await p.getByTestId("projects-view").waitFor({ timeout: 60000 });
  const emptyShown = await p.getByTestId("projects-empty").count();
  const rows = p.getByTestId("project-row");
  const rowCount = await rows.count();
  const rowMeta = await rows.evaluateAll((els) => els.map((e) => ({
    id: e.getAttribute("data-project-id"),
    kind: e.getAttribute("data-unit-kind"),
    precision: e.getAttribute("data-project-precision"),
    text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
  })));
  log({ step: "depth1", url: p.url(), emptyShown, rowCount, rowMeta });
  must("THE FINDING: the drilldown is not empty for real canonical demand", emptyShown === 0 && rowCount > 0, { emptyShown, rowCount });
  const mine = rowMeta.find((r) => r.id === NEED_ID);
  must("the row IS the canonical customer_requests row (same id)", !!mine, mine);
  must("the row declares its provenance as an open need", mine && mine.kind === "need", mine && mine.kind);
  must("the row carries the employer's OWN role text", !!mine && mine.text.toLowerCase().includes(NEED_ROLE));
  must("the row carries the employer's OWN headcount", !!mine && mine.text.includes(String(NEED_HEADCOUNT)));
  await p.screenshot({ path: path.join(OUT, "02-depth1-needs.png") });

  // ── 3. depth 2 — the evaluation opens on the canonical id ──────────────────
  if (mine) await p.locator(`[data-project-id="${NEED_ID}"]`).first().click();
  await p.getByTestId("project-evaluation").waitFor({ timeout: 60000 });
  const sections = {};
  for (const s of ["eval-demand", "eval-geography", "eval-timing", "eval-organization", "eval-data-quality", "eval-explanation"]) {
    sections[s] = await p.getByTestId(s).count();
  }
  const source = await p.getByTestId("demand-source").innerText().catch(() => null);
  log({ step: "depth2", url: p.url(), sections, source });
  must("depth 2 opened on the canonical id", p.url().includes("project=" + NEED_ID));
  must("every evaluation section rendered", Object.values(sections).every((n) => n > 0), sections);
  must("the source statement names the canonical read, not the frozen table",
    !!source && /customer_requests/.test(source) && !/job_demands/.test(source), source);
  await p.screenshot({ path: path.join(OUT, "03-depth2-evaluation.png") });

  // ── 4. the people panel — the surface the finding said was unreachable ─────
  await p.getByTestId("continue-to-people").click();
  await p.getByTestId("people-continuation").waitFor({ timeout: 30000 });
  const people = (await p.getByTestId("people-continuation").innerText()).replace(/\s+/g, " ").trim();
  log({ step: "people", text: people.slice(0, 300) });
  must("THE FINDING CLOSED: the people panel is reachable from real demand", people.length > 0);
  must("it carries the real canonical context, not a fabricated list", people.includes(NEED_ID));
  await p.screenshot({ path: path.join(OUT, "04-people-continuation.png") });

  log({ step: "hygiene", consoleErrors, failedRequests });
  must("no failed request on the journey", failedRequests.length === 0, failedRequests);

  // ── 5. tenant isolation — the same URL, a different tenant ────────────────
  const other = await open(OTHER_TENANT, `/lt/dashboard?result=market&geo=${GEO}&project=${NEED_ID}`);
  await other.p.waitForTimeout(9000);
  const otherText = (await other.p.locator("body").innerText()).replace(/\s+/g, " ");
  const otherRows = await other.p.locator(`[data-project-id="${NEED_ID}"]`).count();
  const notFound = await other.p.getByTestId("evaluation-not-found").count();
  log({ step: "isolation", otherRows, notFound, tail: otherText.slice(0, 200) });
  must("another tenant cannot open this need from a hand-typed URL", otherRows === 0 && notFound > 0, { otherRows, notFound });
  await other.p.screenshot({ path: path.join(OUT, "05-other-tenant-not-found.png") });

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail, ms: Date.now() - t0, build: health.build });
  process.exit(fail.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
