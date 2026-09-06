// PRODUCTION WALK — OPERATIONS AND REPORTING, THE OWNER'S OWN SENTENCES
// (owner window 7 §31 OPERATIONS + REPORT, 2026-09-06).
//
// The owner's regression matrix names sentences, not features. This walk types
// them into production exactly as written and records what actually happens.
// It answers ONE question per sentence:
//
//   does the product understand this, or does it fall back?
//
// The conversation vocabulary already CLAIMS all of them —
// `lib/conversation/intent-catalogue.ts` carries `who-available`,
// `project-risk`, `log-work`, `confirm-work`, `figures`. A claimed intent and a
// working door are different things, and only a live session tells them apart.
//
// READ-ONLY. No form is submitted and no chip that writes is tapped. The
// worker's journal row count is asserted UNCHANGED, so a passing run proves
// nothing was persisted.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-operations-report-prod.cjs
//   MEASURE_ONLY=1  → log everything, never fail (use this first; the point of
//                     the run is to LEARN what is missing, and a hard failure
//                     on sentence 2 would hide sentences 3..6).
//   JOURNEYS=ops|report|all
//
// Every turn goes into ONE live session with no reload between turns — the
// window-7 lesson: a walk that reloads between sentences cannot see a
// continuity defect, because the defect IS the second turn.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const COMPANY = "e2e-walker-202609021438@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const MEASURE_ONLY = process.env.MEASURE_ONLY === "1";
const JOURNEYS = process.env.JOURNEYS || "all";
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-operations-report"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const check = (name, ok, detail) => {
  log({ check: name, ok: !!ok, detail });
  if (!ok && !MEASURE_ONLY) fail.push(name);
};

// The generic not-understood answer. Its appearance IS the finding: the
// sentence reached no canonical action at all.
const FALLBACK = /Galiu padėti su CV, profiliu ir darbo pasiūlymais/i;
// A catalogue resolves a missing key to the key itself without throwing.
const RAW_KEY = /\b(?:conversation|workspace|roleDashboards|demandReadback)\.[a-zA-Z]+\.[a-zA-Z.]+\b/;

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build, region: health.region });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) {
    throw new Error("not on expected build: " + health.build);
  }

  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const mintSession = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return sess.session;
  };
  const session = async (email) => "base64-" + Buffer.from(JSON.stringify(await mintSession(email))).toString("base64url");
  const asUser = async (email) => {
    const sess = await mintSession(email);
    return createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${sess.access_token}` } },
    });
  };
  // service_role holds no grant on journal_entries (revoked default
  // privileges), so the count is read AS the person — the way the product does.
  const journalCount = async (email) => {
    try {
      const me = await asUser(email);
      const { count, error } = await me.from("journal_entries").select("id", { count: "exact", head: true });
      if (error) { log({ step: "journalCount", error: error.message }); return null; }
      return count ?? null;
    } catch (e) { log({ step: "journalCount", error: String(e && e.message) }); return null; }
  };

  const b = await chromium.launch();
  const open = async (email) => {
    const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    return { c, p, failed };
  };

  // ONE turn inside a LIVE session. Only what THIS turn added is read back, so
  // an assertion can never pass on the previous turn's answer.
  const say = async (p, sentence, maxMs = 45000) => {
    const thread = p.getByTestId("conversation-thread");
    const before = await p.getByTestId("msg-assistant").count();
    const resultsBefore = await p.getByTestId("msg-result").count();
    const t0 = Date.now();
    await p.getByTestId("composer-input").fill(sentence);
    await p.getByTestId("composer-input").press("Enter");
    while (Date.now() - t0 < maxMs) {
      await p.waitForTimeout(1000);
      const typing = await p.getByTestId("chat-typing").count();
      const grew =
        (await p.getByTestId("msg-assistant").count()) > before ||
        (await p.getByTestId("msg-result").count()) > resultsBefore ||
        (await p.locator("[data-testid^='inline-action-form-']").count()) > 0;
      if (!typing && grew) break;
    }
    await p.waitForTimeout(4000);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(before).join(" ").replace(/\s+/g, " ").trim();
    const chips = (await thread.locator("button").allInnerTexts().catch(() => []))
      .slice(-10).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const formEl = p.locator("[data-testid^='inline-action-form-']");
    const formId = (await formEl.count())
      ? await formEl.last().getAttribute("data-testid")
      : null;
    const field = async (n) => (await p.getByTestId("field-" + n).count()) ? p.getByTestId("field-" + n).last().inputValue().catch(() => null) : null;
    // The work-log flow is its own component, not an inline-action form.
    const wl = async (n) => (await p.getByTestId("worklog-" + n).count())
      ? (await p.getByTestId("worklog-" + n).last().inputValue().catch(() => null))
        ?? (await p.getByTestId("worklog-" + n).last().innerText().catch(() => null))
      : null;
    return {
      sentence,
      text: text.slice(0, 400),
      chips,
      formId,
      results: (await p.getByTestId("msg-result").count()) - resultsBefore,
      role: await field("role"),
      // What the work-log flow kept from the sentence. MEASURED, not asserted
      // to an exact string: the owner's question here is "does it make me
      // repeat myself", and the honest way to answer it is to record what
      // arrived prefilled and read it.
      worklogOpen: (await p.getByTestId("worklog-flow").count()) > 0,
      worklogDate: await wl("date"),
      worklogSite: await wl("site"),
      worklogNotes: await wl("notes"),
      fallback: FALLBACK.test(text),
      rawKey: (text.match(RAW_KEY) || [null])[0],
    };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});

  // ── OPERATIONS — the company's own coordination questions ────────────────
  if (JOURNEYS !== "report") {
    const { c, p, failed } = await open(COMPANY);
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    // The opening brief races the first sentence of a session (window-6 trap).
    await p.waitForTimeout(8000);

    const turns = [
      ["O1", "Kas rytoj dirba objekte X?"],
      ["O2", "Kur turime laisvų žmonių kitą savaitę?"],
      ["O3", "Kokie darbai vėluoja?"],
      ["O4", "Kiek žmonių trūksta projektui?"],
    ];
    for (const [id, sentence] of turns) {
      const t = await say(p, sentence);
      log({ turn: id, ...t });
      await shot(p, id);
      check(`${id} understood — not the generic fallback`, !t.fallback, t.text.slice(0, 200));
      check(`${id} something was actually answered`, t.text.length > 0 || t.results > 0 || !!t.formId, { len: t.text.length, results: t.results, formId: t.formId });
      check(`${id} no raw translation key in the answer`, !t.rawKey, t.rawKey);
    }
    check("OPS no failed requests", failed.length === 0, failed.slice(0, 5));
    await c.close();
  }

  // ── REPORT — the worker states the day's work in one sentence ────────────
  if (JOURNEYS !== "ops") {
    const journalBefore = await journalCount(WORKER);
    const { c, p, failed } = await open(WORKER);
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(8000);

    // The owner's sentence, verbatim. It carries THREE facts — hours, activity
    // and place — and the door must keep them; asking for them again is the
    // same "make me repeat myself" defect the goal-state work closed.
    const r1 = await say(p, "Šiandien 8 valandas montavome pastolius objekte X.");
    log({ turn: "R1", ...r1 });
    await shot(p, "R1");
    check("R1 understood — not the generic fallback", !r1.fallback, r1.text.slice(0, 200));
    check("R1 the work-log door opened", r1.worklogOpen || /log-work|journal/i.test(r1.formId || "") || r1.results > 0, { worklogOpen: r1.worklogOpen, formId: r1.formId, results: r1.results });
    // Recorded, not asserted — see `say()`. Whether the eight hours, the
    // scaffolding and the site survived the sentence is the finding.
    log({ turn: "R1 carried", date: r1.worklogDate, site: r1.worklogSite, notes: r1.worklogNotes });
    check("R1 no raw translation key", !r1.rawKey, r1.rawKey);

    // Who receives it. If nothing does, the report loop is open and the answer
    // must say so honestly rather than implying a reviewer that does not exist.
    const r2 = await say(p, "Kam pateikti atliktą darbą?");
    log({ turn: "R2", ...r2 });
    await shot(p, "R2");
    check("R2 understood — not the generic fallback", !r2.fallback, r2.text.slice(0, 200));
    check("R2 no raw translation key", !r2.rawKey, r2.rawKey);

    const journalAfter = await journalCount(WORKER);
    check(
      "REPORT read-only: the journal row count is unchanged",
      journalBefore !== null && journalAfter !== null && journalBefore === journalAfter,
      { before: journalBefore, after: journalAfter },
    );
    check("REPORT no failed requests", failed.length === 0, failed.slice(0, 5));
    await c.close();
  }

  await b.close();
  log({ result: fail.length ? "FAIL" : "PASS", failed: fail });
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { log({ fatal: String((e && e.stack) || e) }); process.exit(1); });
