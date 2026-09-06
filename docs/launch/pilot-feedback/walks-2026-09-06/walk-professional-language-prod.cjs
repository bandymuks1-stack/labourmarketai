// PRODUCTION WALK — professional / natural-language breadth (window 6, lane E+B).
//
// Twenty Lithuanian sentences as ordinary people type them, each walked with the
// bounded E2E identity that would say it, read-only (no form is submitted):
//   EMPLOYER (company workspace) — the need form must open with the ROLE the
//     employer named (a profession OUTSIDE the 43 manual work types too),
//     the headcount, the start date ("nuo spalio") and the city ("Vilniuje").
//   PERSON / WORKER — "esu buhalteris" is a profession statement; service
//     offers/requests reach the services doors; "ieškau darbo" leads with the
//     one missing fact before foreign listings.
// Every sentence is logged verbatim (answer, chips, prefilled fields) so the
// BEFORE table (production ca96605b) and the AFTER table share one method.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-professional-language-prod.cjs
//   MEASURE_ONLY=1 → log everything, never fail (the BEFORE run).
//   LEGS=base|followup|all (default all) → the original twenty, the window-6
//     follow-up legs (A1–A4 worker/person, G1–G3 company), or both.
//
// FOLLOW-UP LEGS (measured on production ca96605b by the real-person join walk
// and the company walk, 2026-09-06):
//   A1 "ieškau darbo Norvegijoje" from a worker whose countries are NL/DE → a
//      dead end ("nieko nematoma. Matoma: NL") with no chip. Must offer the
//      add-country door and say honestly whether public ads exist there.
//   A2 "Užpildyk darbo žurnalą" → the REQUEST sentence became the journal
//      evidence. Must open the flow with the evidence EMPTY; NOTHING is saved
//      (the walk never taps save; the journal row count is asserted equal).
//   A3 "galiu dirbti nuo spalio 1 d." → treated as a search with no criteria.
//      Must open the work card with the date prefilled.
//   A4 "dirbau suvirintoju Norvegijoje 3 metus" → asked "which day and how
//      long". Must open work history with the title.
//   G1 COMPANY "ieškau darbo" → ran the person's search inside the company.
//      Must answer one line + the personal-space chip, no result, no form.
//   G2 "remontuoju automobilius" → "not sure whether you offer or seek".
//      Must reach the services door (person AND company).
//   G3 COMPANY "reikia buhalterio paslaugų" → the HIRING form. Must reach the
//      service door, no need form.
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
const MEASURE_ONLY = process.env.MEASURE_ONLY === "1";
const LEGS = process.env.LEGS || "all";
if (!["all", "base", "followup"].includes(LEGS)) throw new Error("LEGS must be all|base|followup");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-professional-language"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };

// ── The sentences ─────────────────────────────────────────────────────────
// expect: what the AFTER state must show. role/team/start/loc are regexes over
// the need-form prefill; text/chips are regexes over the answer / chip row.
const EMPLOYER = [
  { s: "Reikia 2 automechanikų.", role: /automechanik/i, team: "2" },
  { s: "Reikia buhalterio.", role: /buhalter/i },
  { s: "Reikia programinės įrangos kūrėjo.", role: /programuotoj|kūrėj/i },
  { s: "Reikia projektų vadovo.", role: /projekt.*vadov/i },
  { s: "reikia suvirintojo nuo spalio", role: /suvirintoj/i, start: /^\d{4}-10-01$/ },
  { s: "ieškome pardavimų specialisto Vilniuje", role: /pardav/i, loc: /vilni/i },
  { s: "reikia inžinieriaus", role: /inžinier/i },
  { s: "reikia teisininko", role: /teisinink/i },
  { s: "reikia dizainerio", role: /dizainer/i },
  { s: "reikia mokytojo", role: /mokytoj/i },
  { s: "restoranui reikia virėjo Kaune nuo spalio", role: /virėj/i, team: "1", start: /^\d{4}-10-01$/, loc: /kaun/i },
];
const PERSONS = [
  // The profession is read BEFORE the board (G-A1): the readback line and the
  // one chip that records it come first; the listings follow in the panel.
  { who: "worker", s: "esu buhalteris, ieškau darbo", text: /buhalter/i, chips: /darbo patirt|profesij/i },
  { who: "person", s: "esu programuotojas", text: /programuotoj/i, chips: /profesij/i },
  // A past job opens the work-history form with the title already in it.
  { who: "person", s: "dirbau projektų vadovu 5 metus", text: /projekt.*vadov/i, title: /projekt.*vadov/i },
  { who: "worker", s: "esu elektrikas, ieškau darbo Norvegijoje", text: /elektrik/i, chips: /profesij/i },
  { who: "person", s: "esu dėstytojas", text: /dėstytoj|mokytoj/i, chips: /profesij/i },
  { who: "person", s: "galiu konsultuoti finansų klausimais", text: /paslaug/i, chips: /paslaug/i },
  { who: "person", s: "dirbu inžinieriumi", text: /inžinier/i, chips: /darbo patirt/i },
  { who: "person", s: "siūlau korepetitoriaus paslaugas", text: /paslaug/i, chips: /paslaug/i },
  { who: "person", s: "reikia dažytojo butui", text: /darbas, kurį reikia atlikti|paslaug/i, chips: /paslaug/i },
  { who: "person", s: "reikia valymo paslaugų", text: /darbas, kurį reikia atlikti|paslaug/i, chips: /paslaug/i },
];
// Window-6 follow-up (see the header). The WORKER identity's countries are
// NL + DE; NO has no public ads from official sources, SE has (measured on
// production: public_vacancies holds SE rows only).
const FOLLOWUP_PERSONS = [
  { who: "worker", s: "ieškau darbo Norvegijoje", text: /Norvegij/i, chips: /pridėti šalį|dokument/i, noDeadEnd: true, saysNoAds: true },
  { who: "worker", s: "esu suvirintojas, ieškau darbo Norvegijoje", text: /suvirintoj/i, chips: /pridėti šalį|dokument/i, noDeadEnd: true },
  { who: "worker", s: "ieškau darbo Švedijoje", text: /viešų skelbimų iš oficialių šaltinių/i, chips: /pridėti šalį/i, noDeadEnd: true },
  { who: "worker", s: "Užpildyk darbo žurnalą", flowEmpty: true, journalUnchanged: true, text: /Ką šiandien dirbai/i },
  { who: "worker", s: "galiu dirbti nuo spalio 1 d.", text: /gali dirbti nuo/i, availableFrom: /^\d{4}-10-01$/ },
  { who: "worker", s: "dirbau suvirintoju Norvegijoje 3 metus", text: /suvirintoj/i, title: /suvirintoj/i },
  { who: "person", s: "remontuoju automobilius", text: /paslaug/i, chips: /paslaug/i },
];
const FOLLOWUP_COMPANY = [
  { s: "ieškau darbo", text: /asmenin/i, chips: /Asmeninė erdvė/i, noResults: true, noForm: true },
  { s: "remontuoju automobilius", text: /paslaug/i, chips: /paslaug/i, noForm: true },
  { s: "reikia buhalterio paslaugų", text: /paslaug/i, chips: /Rasti paslaugą/i, noForm: true },
];

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
    return { c, p, failed };
  };
  // A fresh screen per sentence: the previous answer's form/chips must not be
  // read as this sentence's.
  const fresh = async (p) => {
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
  };
  const ask = async (p, sentence, maxMs = 45000) => {
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
        (await p.getByTestId("msg-result").count()) > resultsBefore ||
        (await p.getByTestId("field-role").count()) > 0 ||
        (await p.getByTestId("worklog-flow").count()) > 0 ||
        (await p.getByTestId("field-availabilityStatus").count()) > 0;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    await p.waitForTimeout(6000);
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    const field = async (n) => (await p.getByTestId("field-" + n).count()) ? p.getByTestId("field-" + n).last().inputValue().catch(() => null) : null;
    const form = (await p.getByTestId("field-role").count()) > 0
      ? { role: await field("role"), teamSize: await field("teamSize"), startDate: await field("startDate"), location: await field("location") }
      : null;
    // The work-history form (a past job stated by sentence) carries a title.
    const title = await field("title");
    // The work card (availability stated by sentence) carries the from-date.
    const availableFrom = await field("availableFrom");
    // The journal flow: open? and what the evidence field holds (A2: must be
    // EMPTY for a request sentence — the walk never taps save).
    const flowOpen = (await p.getByTestId("worklog-flow").count()) > 0;
    const notes = flowOpen ? await p.getByTestId("worklog-notes").last().inputValue().catch(() => null) : null;
    return { text, results, firstAnswerMs, chips: chips.slice(-8).map((x) => x.replace(/\s+/g, " ").trim()), form, title, availableFrom, flowOpen, notes };
  };
  // Journal rows of an identity, read with the admin client (read-only): the
  // A2 leg asserts the count did not move.
  const journalCount = async (email) => {
    const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!prof) return null;
    const { data: w } = await admin.from("workers").select("id").eq("profile_id", prof.id).maybeSingle();
    if (!w) return null;
    const { count } = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("worker_id", w.id);
    return count ?? null;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const check = (name, ok, detail) => (MEASURE_ONLY ? log({ check: name, ok: !!ok, detail }) : must(name, ok, detail));

  // ── EMPLOYER — the company workspace ──────────────────────────────────────
  if (LEGS !== "followup") {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 800 });
    let i = 0;
    for (const e of EMPLOYER) {
      i++;
      await fresh(p);
      const a = await ask(p, e.s);
      log({ leg: "employer", sentence: e.s, ...a });
      check(`[E${i}] '${e.s}' opens the need form`, a.form !== null, a.text.slice(0, 160));
      if (e.role) check(`[E${i}] role prefilled ${e.role}`, e.role.test(a.form?.role ?? ""), a.form?.role ?? null);
      if (e.team) check(`[E${i}] headcount ${e.team}`, String(a.form?.teamSize ?? "").trim() === e.team, a.form?.teamSize ?? null);
      if (e.start) check(`[E${i}] start date ${e.start}`, e.start.test(a.form?.startDate ?? ""), a.form?.startDate ?? null);
      if (e.loc) check(`[E${i}] location ${e.loc}`, e.loc.test(a.form?.location ?? ""), a.form?.location ?? null);
      await shot(p, `E${String(i).padStart(2, "0")}`);
    }
    log({ leg: "employer_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── PERSON / WORKER ───────────────────────────────────────────────────────
  if (LEGS !== "followup") {
    const ctx = { person: await open(PERSON, { width: 390, height: 844 }), worker: await open(WORKER, { width: 390, height: 844 }) };
    let i = 0;
    for (const e of PERSONS) {
      i++;
      const { p } = ctx[e.who];
      await fresh(p);
      const a = await ask(p, e.s);
      log({ leg: e.who, sentence: e.s, ...a });
      check(`[P${i}] '${e.s}' answers (not the menu)`, (a.text.length > 10 || a.results > 0) && !/Galiu padėti su CV, profiliu/i.test(a.text), a.text.slice(0, 200));
      if (e.text) check(`[P${i}] answer reads the fact ${e.text}`, e.text.test(a.text) || e.text.test(a.chips.join(" ")), { text: a.text.slice(0, 200), chips: a.chips });
      if (e.chips) check(`[P${i}] chip ${e.chips}`, a.chips.some((x) => e.chips.test(x)), a.chips);
      if (e.title) check(`[P${i}] work-history form opens with the title ${e.title}`, e.title.test(a.title ?? ""), a.title);
      await shot(p, `P${String(i).padStart(2, "0")}-${e.who}`);
    }
    log({ leg: "person_failed_requests", failed: ctx.person.failed.slice(0, 5), worker: ctx.worker.failed.slice(0, 5) });
    await ctx.person.c.close(); await ctx.worker.c.close();
  }

  // ── WINDOW-6 FOLLOW-UP: A1–A4 (worker / person) ───────────────────────────
  if (LEGS !== "base") {
    const ctx = { person: await open(PERSON, { width: 390, height: 844 }), worker: await open(WORKER, { width: 390, height: 844 }) };
    let i = 0;
    for (const e of FOLLOWUP_PERSONS) {
      i++;
      const { p } = ctx[e.who];
      const before = e.journalUnchanged ? await journalCount(e.who === "worker" ? WORKER : PERSON) : null;
      await fresh(p);
      const a = await ask(p, e.s);
      log({ leg: `followup-${e.who}`, sentence: e.s, ...a });
      check(`[A${i}] '${e.s}' answers (not the menu)`, (a.text.length > 10 || a.results > 0 || a.flowOpen) && !/Galiu padėti su CV, profiliu/i.test(a.text), a.text.slice(0, 200));
      if (e.text) check(`[A${i}] answer reads ${e.text}`, e.text.test(a.text) || e.text.test(a.chips.join(" ")), { text: a.text.slice(0, 240), chips: a.chips });
      if (e.chips) check(`[A${i}] chip ${e.chips}`, a.chips.some((x) => e.chips.test(x)), a.chips);
      if (e.noDeadEnd) check(`[A${i}] not a dead end (a chip after the country answer)`, a.chips.length > 0, a.chips);
      if (e.saysNoAds) check(`[A${i}] says plainly there are no public ads there`, /nėra/i.test(a.text) && /viešų skelbimų/i.test(a.text), a.text.slice(0, 240));
      if (e.flowEmpty) check(`[A${i}] the journal flow opens with EMPTY evidence (the request is not the work)`, a.flowOpen && (a.notes ?? "").trim() === "", { flowOpen: a.flowOpen, notes: a.notes });
      if (e.journalUnchanged) {
        const after = await journalCount(e.who === "worker" ? WORKER : PERSON);
        check(`[A${i}] journal rows unchanged (${before} → ${after})`, before !== null && before === after, { before, after });
      }
      if (e.availableFrom) check(`[A${i}] work card opens with availableFrom ${e.availableFrom}`, e.availableFrom.test(a.availableFrom ?? ""), a.availableFrom);
      if (e.title) check(`[A${i}] work-history form opens with the title ${e.title}`, e.title.test(a.title ?? ""), a.title);
      await shot(p, `A${String(i).padStart(2, "0")}-${e.who}`);
    }
    log({ leg: "followup_person_failed_requests", failed: ctx.person.failed.slice(0, 5), worker: ctx.worker.failed.slice(0, 5) });
    await ctx.person.c.close(); await ctx.worker.c.close();
  }

  // ── WINDOW-6 FOLLOW-UP: G1–G3 (company workspace) ─────────────────────────
  if (LEGS !== "base") {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 800 });
    let i = 0;
    for (const e of FOLLOWUP_COMPANY) {
      i++;
      await fresh(p);
      const a = await ask(p, e.s);
      log({ leg: "followup-company", sentence: e.s, ...a });
      check(`[G${i}] '${e.s}' answers (not the menu)`, (a.text.length > 10 || a.results > 0) && !/Galiu padėti su/i.test(a.text), a.text.slice(0, 200));
      if (e.text) check(`[G${i}] answer reads ${e.text}`, e.text.test(a.text) || e.text.test(a.chips.join(" ")), { text: a.text.slice(0, 240), chips: a.chips });
      if (e.chips) check(`[G${i}] chip ${e.chips}`, a.chips.some((x) => e.chips.test(x)), a.chips);
      if (e.noResults) check(`[G${i}] no search result rendered in the company context`, a.results === 0, a.results);
      if (e.noForm) check(`[G${i}] no need form opened`, a.form === null, a.form);
      await shot(p, `G${String(i).padStart(2, "0")}-company`);
    }
    log({ leg: "followup_company_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail, measureOnly: MEASURE_ONLY });
  process.exit(fail.length === 0 ? 0 : 1);
})();
