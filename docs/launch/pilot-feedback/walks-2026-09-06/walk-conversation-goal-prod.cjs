// PRODUCTION WALK — MULTI-TURN CONVERSATION GOAL (owner P0, window 7, 2026-09-06).
//
// This walk exists because of one production observation by the owner:
//
//   person : "Ieškau darbo pagal savo CV"
//   system : offers the CV upload
//   person : "tu jau turi mano duomenis"
//   system : offers the CV upload AGAIN
//
// Every other conversation walk in this repo sends ONE sentence per fresh
// page (`fresh(p)` between sentences) precisely so answers cannot contaminate
// each other. That method cannot see this defect at all: the defect IS the
// second turn. So this walk deliberately does the opposite — it types the
// whole journey into ONE session, without reloading, and asserts what the
// conversation remembers.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-conversation-goal-prod.cjs
//   MEASURE_ONLY=1  → log everything, never fail (the BEFORE run).
//   JOURNEYS=a|d|all (default all)
//
// READ-ONLY. No form is ever submitted and no chip that writes is tapped, so
// nothing is persisted. The journal row count is asserted UNCHANGED for the
// worker identity, the same way the window-6 A2 leg proves it.
//
// JOURNEY A — the owner's own four turns (worker identity).
//   A1 "Ieškau darbo pagal savo CV"      the GOAL is work; the CV is one
//                                        possible SOURCE. The answer must not
//                                        make the uploader the destination.
//   A2 "tu jau turi mano duomenis"       must NOT reopen the uploader and must
//                                        NOT re-offer the CV chip. Before the
//                                        fix this scored 0 in the router and
//                                        fell to the generic fallback, whose
//                                        chip row carries "Įkelti CV".
//   A3 "gerai, tada ieškok visoje Europoje"   same goal, geography changes.
//   A4 "rodyk tik nuo 3000 eurų"         same goal, a pay constraint. Before
//                                        the fix this scored 0 → fallback.
//   Across A2–A4 the generic fallback sentence must never appear.
//
// JOURNEY D — agency supply stays supply (owner §4/§9 D, company identity).
//   D1 "Turime 20 suvirintojų, kuriems ieškome darbo."  must open the OFFER
//      form (supply wording), never the hiring need form, and never a
//      personal job search.
//   D2..D4 refinements must not flip the direction.
//   Requires the supply build (#1587); skipped with a named reason otherwise.
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
const OUT = path.join(__dirname, "walk-conversation-goal"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const check = (name, ok, detail) => {
  log({ check: name, ok: !!ok, detail });
  if (!ok && !MEASURE_ONLY) fail.push(name);
};

// The generic not-understood answer. Its appearance after a continuation IS
// the defect: it means the turn was routed from scratch and understood as
// nothing.
const FALLBACK = /Galiu padėti su CV, profiliu ir darbo pasiūlymais/i;
// The CV chip label, in the row the thread offers.
const CV_CHIP = /įkelti cv/i;

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
  // privileges), so the row count is read AS the person — the way the product
  // reads it. `null` = the read failed, reported as a failed check.
  const journalCount = async (email) => {
    try {
      const me = await asUser(email);
      const { count, error } = await me.from("journal_entries").select("id", { count: "exact", head: true });
      if (error) { log({ step: "journalCount", error: error.message }); return null; }
      return count ?? null;
    } catch (e) { log({ step: "journalCount", error: String(e && e.message) }); return null; }
  };

  const b = await chromium.launch();
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    return { c, p, failed };
  };

  // ONE turn inside a LIVE session — deliberately no reload between turns.
  // Only the messages added by THIS turn are read back, so an assertion can
  // never accidentally pass on a previous turn's answer.
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
        (await p.getByTestId("field-role").count()) > 0 ||
        (await p.getByTestId("cv-import-upload").count()) > 0;
      if (!typing && grew) break;
    }
    await p.waitForTimeout(5000);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(before).join(" ").replace(/\s+/g, " ").trim();
    const chips = (await thread.locator("button").allInnerTexts().catch(() => []))
      .slice(-10).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const field = async (n) => (await p.getByTestId("field-" + n).count()) ? p.getByTestId("field-" + n).last().inputValue().catch(() => null) : null;
    return {
      sentence,
      text,
      chips,
      // The CV uploader actually mounted in the thread — the destination the
      // owner watched appear twice.
      cvUploaderOpen: (await p.getByTestId("cv-import-upload").count()) > 0,
      results: (await p.getByTestId("msg-result").count()) - resultsBefore,
      form: (await p.getByTestId("field-role").count()) > 0
        ? { role: await field("role"), teamSize: await field("teamSize"), location: await field("location") }
        : null,
    };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});

  // ── JOURNEY A — the owner's four turns, one session ──────────────────────
  if (JOURNEYS !== "d") {
    const journalBefore = await journalCount(WORKER);
    const { c, p, failed } = await open(WORKER, { width: 1280, height: 900 });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    // The opening brief races the FIRST sentence of a session (window-6 trap):
    // wait for it to land before typing, or turn 1 is measured mid-write.
    await p.waitForTimeout(8000);

    const a1 = await say(p, "Ieškau darbo pagal savo CV");
    log({ turn: "A1", ...a1 });
    await shot(p, "A1");
    check("A1 the goal is answered, not turned into an upload", !a1.cvUploaderOpen, a1.text.slice(0, 200));
    check("A1 something was actually answered", a1.text.length > 0 || a1.results > 0, { len: a1.text.length, results: a1.results });

    const a2 = await say(p, "tu jau turi mano duomenis");
    log({ turn: "A2", ...a2 });
    await shot(p, "A2");
    // THE DEFECT, stated as three independent checks.
    check("A2 the CV uploader does NOT reopen", !a2.cvUploaderOpen, a2.text.slice(0, 200));
    check("A2 the CV chip is NOT re-offered", !a2.chips.some((x) => CV_CHIP.test(x)), a2.chips);
    check("A2 not the generic fallback", !FALLBACK.test(a2.text), a2.text.slice(0, 200));

    const a3 = await say(p, "gerai, tada ieškok visoje Europoje");
    log({ turn: "A3", ...a3 });
    await shot(p, "A3");
    check("A3 the goal survived — not the fallback", !FALLBACK.test(a3.text), a3.text.slice(0, 200));
    check("A3 the CV uploader stays closed", !a3.cvUploaderOpen, null);

    const a4 = await say(p, "rodyk tik nuo 3000 eurų");
    log({ turn: "A4", ...a4 });
    await shot(p, "A4");
    check("A4 a pay constraint does not end the conversation", !FALLBACK.test(a4.text), a4.text.slice(0, 200));
    check("A4 the CV chip is still not back", !a4.chips.some((x) => CV_CHIP.test(x)), a4.chips);

    const journalAfter = await journalCount(WORKER);
    check(
      "A read-only: the journal row count is unchanged",
      journalBefore !== null && journalAfter !== null && journalBefore === journalAfter,
      { before: journalBefore, after: journalAfter },
    );
    check("A no failed requests", failed.length === 0, failed.slice(0, 5));
    await c.close();
  }

  // ── JOURNEY D — agency supply stays supply ───────────────────────────────
  if (JOURNEYS !== "a") {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 900 });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(8000);

    const d1 = await say(p, "Turime 20 suvirintojų, kuriems ieškome darbo.");
    log({ turn: "D1", ...d1 });
    await shot(p, "D1");
    // The sentence must reach the SUPPLY door. Before #1587 it reached
    // `find-work` — a personal job search inside a company workspace, which
    // the company guard answers with the personal-space chip.
    check("D1 not answered as a personal job search", !/asmenin/i.test(d1.text), d1.text.slice(0, 200));
    check(
      "D1 the offer form opened with the trade and the count",
      !!d1.form && /suvirintoj/i.test(d1.form.role || "") && String(d1.form.teamSize || "") === "20",
      d1.form,
    );

    const d2 = await say(p, "Nuo spalio.");
    log({ turn: "D2", ...d2 });
    check("D2 the direction did not flip to a need", !/reikia|poreik/i.test(d2.text), d2.text.slice(0, 200));

    const d3 = await say(p, "Nyderlanduose arba Belgijoje.");
    log({ turn: "D3", ...d3 });
    await shot(p, "D3");
    check("D3 still the same statement", !FALLBACK.test(d3.text), d3.text.slice(0, 200));

    check("D no failed requests", failed.length === 0, failed.slice(0, 5));
    await c.close();
  }

  await b.close();
  log({ done: true, failures: fail });
  if (fail.length && !MEASURE_ONLY) { console.error("FAILED: " + fail.join(" | ")); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
