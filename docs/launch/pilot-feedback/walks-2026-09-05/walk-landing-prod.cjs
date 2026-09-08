// Production walk — P1 PUBLIC ENTRY (#1528) + the `?say=` hand-off (#1531):
//  L1 anon /lt → the three example sentences (tapped) → [entry-understanding] data-intent per sentence;
//  L2 a typed real need → recognised; L3 an unreadable sentence → [entry-question] with exactly two chips → chip → family;
//  L4 the doors carry `?next=/dashboard?say=…`; readback printed: pilot_events landing_intent since the walk began;
//  H1 hand-off: the E2E employer (already signed in) follows the LOGIN door href → lands on /lt/dashboard → the first
//     own turn [msg-user] equals the sentence → the URL no longer carries `say` → the demand flow answered.
// Residue: none persisted by the sentence itself (the demand form is not submitted); landing_intent rows are telemetry.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const NEED = "Reikia 12 pastolininkų Roterdame";
const NOISE = "labas rytas, šiandien graži diena";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-landing"); fs.mkdirSync(OUT, { recursive: true });
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
  const startedAt = new Date().toISOString();
  const b = await chromium.launch();
  const t0 = Date.now();
  // ── L1–L4: anonymous visitor on /lt ──────────────────────────────────────────
  const a = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT" })).newPage();
  await a.goto("https://labourmarket.ai/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
  await a.getByTestId("entry-input").waitFor({ timeout: 60000 });
  const understanding = async () => {
    const u = a.getByTestId("entry-understanding");
    await u.waitFor({ timeout: 15000 });
    return { intent: await u.getAttribute("data-intent"), text: (await u.innerText()).replace(/\s+/g, " ").slice(0, 220) };
  };
  const doors = async () => {
    const s = await a.getByTestId("entry-signup").locator("a").getAttribute("href");
    const l = await a.getByTestId("entry-login").locator("a").getAttribute("href");
    return { signup: s, login: l };
  };
  const examples = a.getByTestId("entry-example");
  const n = await examples.count();
  const results = [];
  for (let i = 0; i < n; i++) {
    const label = (await examples.nth(i).innerText()).trim();
    await examples.nth(i).click();
    const u = await understanding();
    const d = await doors();
    results.push({ sentence: label, intent: u.intent, understood: u.text, signupCarriesSay: /say%3D|say=/.test(d.signup || ""), loginCarriesSay: /say%3D|say=/.test(d.login || "") });
  }
  log({ step: "L1_examples", count: n, results });
  await a.screenshot({ path: path.join(OUT, "01-example.png"), fullPage: true });
  // L2 — a typed real need
  await a.getByTestId("entry-input").fill(NEED);
  await a.getByTestId("entry-submit").click();
  const typed = await understanding();
  const typedDoors = await doors();
  log({ step: "L2_typed_need", sentence: NEED, intent: typed.intent, understood: typed.text, doors: typedDoors });
  // L3 — an unreadable sentence → one question, two chips → chip
  await a.getByTestId("entry-input").fill(NOISE);
  await a.getByTestId("entry-submit").click();
  const q = a.getByTestId("entry-question");
  const hasQuestion = await q.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  const chips = a.getByTestId("entry-chip");
  const chipCount = await chips.count();
  const chipLabels = await chips.allInnerTexts();
  const qText = hasQuestion ? (await q.innerText()).replace(/\s+/g, " ").slice(0, 200) : null;
  let chipResult = null;
  if (chipCount > 0) { await chips.first().click(); chipResult = await understanding(); }
  log({ step: "L3_unrecognised", hasQuestion, chipCount, chipLabels, question: qText, afterChip: chipResult });
  await a.screenshot({ path: path.join(OUT, "02-question-chip.png"), fullPage: true });
  await a.waitForTimeout(3000); // let the anon telemetry inserts land
  // L4 — readback of landing_intent telemetry (anon insert path)
  const { data: ev, error: evErr } = await admin.from("pilot_events").select("event_name, metadata, created_at").eq("event_name", "landing_intent").gte("created_at", startedAt).order("created_at", { ascending: true });
  log({ step: "L4_readback_landing_intent", error: evErr ? evErr.message : null, rows: (ev || []).length, steps: (ev || []).map((r) => (r.metadata && (r.metadata.step || r.metadata.intent)) || null), sentenceLeaked: JSON.stringify(ev || []).includes("pastolinink") });
  // ── H1: the hand-off through the LOGIN door for a signed-in employer ─────────
  const c = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(MANAGER), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const loginHref = typedDoors.login.startsWith("http") ? typedDoors.login : "https://labourmarket.ai" + typedDoors.login;
  await p.goto(loginHref, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(4000);
  let landed = p.url();
  let viaDoor = /\/dashboard/.test(landed);
  if (!viaDoor) {
    // The door did not forward a live session by itself — record it and continue on the sanitised return path the door carries.
    const next = new URL(loginHref).searchParams.get("next") || "/dashboard?say=" + encodeURIComponent(NEED);
    await p.goto("https://labourmarket.ai/lt" + next, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
  let body = "", firstUser = null;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1500);
    const users = p.getByTestId("msg-user");
    if ((await users.count()) > 0) firstUser = (await users.first().innerText()).trim();
    body = await p.locator("body").innerText();
    if (firstUser && /pastolinink|Poreik|poreik|darbuotoj/i.test(body.replace(firstUser, ""))) break;
  }
  const urlAfter = p.url();
  log({ step: "H1_handoff", doorHref: loginHref, viaDoor, landedAfterDoor: landed, urlAfter, sayStripped: !/say=/.test(urlAfter), firstUserTurn: firstUser, firstTurnIsSentence: firstUser === NEED, answerExcerpt: body.replace(/\s+/g, " ").slice(0, 600) });
  await p.screenshot({ path: path.join(OUT, "03-handoff.png"), fullPage: true });
  // reload → the sentence must NOT be re-sent
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);
  const userTurns = await p.getByTestId("msg-user").count();
  log({ step: "H2_reload_no_resend", userTurnsAfterReload: userTurns, url: p.url() });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0 });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
