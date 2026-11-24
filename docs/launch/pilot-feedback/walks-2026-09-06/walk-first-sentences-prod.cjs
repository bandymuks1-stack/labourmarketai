// PRODUCTION WALK — the first screen and the first sentences (PR fix/cc/first-sentences).
//
// WHAT IT PROVES against production, read-only, with bounded E2E identities:
//   A/B. WORKER: "ieškau darbo" answers within the statement timeout with the board (the
//        generic vacancy page walks its index now; a failed feed degrades, never breaks).
//   C.   The opening brief never lands AFTER the person's first sentence: the answer's own
//        chips stay (person: "reikia dviejų santechnikų" → service-request + company doors).
//   D.   WORKER: "kas man trūksta?" → the skills/documents answer (deterministic skill-gap),
//        with the grouped documents line (#1564 #5) — no document name repeated.
//   E.   COMPANY: "mano autoservisui reikia 2 mechanikų kitą mėnesį" → the need form opens
//        with the ROLE prefilled "Automechanikas" and headcount 2.
//
// Read-only: no form is submitted, no row is created by hand.
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-first-sentences-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const PERSON = "e2e-spine-person-202609051508@labourmarket.ai";
const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-first-sentences"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };

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
  const b = await chromium.launch();
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    // Type IMMEDIATELY (the brief is a slow read; the point of leg C is that
    // the person who speaks first keeps their answer's chips).
    return { c, p, failed };
  };
  const ask = async (p, sentence, maxMs = 45000) => {
    // The answer is counted in MESSAGES (assistant bubbles + result panels),
    // not in thread text: a result panel renders outside the thread node and
    // the thread's innerText is not a stable growth signal (first run of this
    // walk: the board was on screen while the text capture read "").
    const thread = p.getByTestId("conversation-thread");
    const assistantBefore = await p.getByTestId("msg-assistant").count();
    const resultsBefore = await p.getByTestId("msg-result").count();
    const t0 = Date.now();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    let firstAnswerMs = -1;
    while (Date.now() - t0 < maxMs) {
      await p.waitForTimeout(1000);
      const typing = await p.getByTestId("chat-typing").count();
      const grew =
        (await p.getByTestId("msg-assistant").count()) > assistantBefore ||
        (await p.getByTestId("msg-result").count()) > resultsBefore;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    // Let a late brief (if any) land, so the chip row we read is the FINAL one.
    await p.waitForTimeout(6000);
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    return { text, results, firstAnswerMs, chips: chips.slice(-6) };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});

  // ── C. PERSON — the answer keeps its own chips ────────────────────────────
  {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 });
    const a = await ask(p, "reikia dviejų santechnikų");
    log({ leg: "person_trade_need", ...a });
    must("person's answer is the service-need line", /darbas, kurį reikia atlikti/i.test(a.text), a.text.slice(0, 160));
    must("the answer's own chips stay: service-request door", a.chips.some((x) => /paslaug/i.test(x)), a.chips);
    must("the answer's own chips stay: company-setup door", a.chips.some((x) => /įmon|organizacij/i.test(x)), a.chips);
    must("no late opening brief after the person spoke", !/Profilyje dar trūksta/i.test(a.text), a.text.slice(0, 200));
    await shot(p, "01-person-chips-stay");
    log({ leg: "person_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── A/B/D. WORKER ─────────────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(WORKER, { width: 390, height: 844 });
    const a = await ask(p, "ieškau darbo");
    log({ leg: "worker_find_work", ms: a.firstAnswerMs, text: a.text.slice(0, 200), chips: a.chips });
    must("'ieškau darbo' answers (board or honest state) within 20 s", (a.text.length > 10 || a.results > 0) && a.firstAnswerMs > 0 && a.firstAnswerMs < 20000, { ms: a.firstAnswerMs, results: a.results });
    must("'ieškau darbo' is not the not-understood menu", !/Galiu padėti su CV, profiliu/i.test(a.text), a.text.slice(0, 160));
    await shot(p, "02-worker-find-work");

    const d = await ask(p, "kas man trūksta?");
    log({ leg: "worker_documents_gap", ...d });
    must("'kas man trūksta?' answers the gap, not the menu", /trūksta|netrūksta|Dokumentai/i.test(d.text) && !/Galiu padėti su CV, profiliu/i.test(d.text), d.text.slice(0, 220));
    const m = d.text.match(/Dokumentai: trūksta \d+ \((.*?)\)\.?(?= |$)/);
    const list = m ? m[1] : "";
    const names = list.replace(/\([A-Z]{2}(, [A-Z]{2})*\)/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    must("no document name is repeated in the gap line", list.length > 0 && dupes.length === 0, { list, dupes });
    await shot(p, "03-worker-documents-gap");
    log({ leg: "worker_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── E. COMPANY — the mechanic keeps its role ──────────────────────────────
  {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 800 });
    await ask(p, "mano autoservisui reikia 2 mechanikų kitą mėnesį");
    await p.getByTestId("field-role").waitFor({ timeout: 30000 }).catch(() => {});
    const roleAny = await p.getByTestId("field-role").inputValue().catch(() => null);
    const team = await p.getByTestId("field-teamSize").inputValue().catch(() => null);
    log({ leg: "company_mechanic", role: roleAny, teamSize: team });
    must("the need form's role is prefilled 'Automechanikas'", /automechanik/i.test(roleAny ?? ""), roleAny);
    must("headcount 2 is read", String(team ?? "").trim() === "2", team);
    await shot(p, "04-company-mechanic-form");
    log({ leg: "company_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})();
