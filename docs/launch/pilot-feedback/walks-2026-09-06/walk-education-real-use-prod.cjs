// PRODUCTION WALK — a real college and a real student, by sentence (lane C, window 6).
//
// WHAT IT PROVES against production, READ-ONLY, with the bounded E2E identities
// (institution = E2E Walker UAB, capability training_provider; learner = its one
// accepted student). No form is submitted, no invitation is sent, no row is created.
//
//   INSTITUTION (college staff who never saw the product):
//     1. the FIRST screen names the institution's own work (students / programmes),
//        not employer copy, and offers the institution's next steps as chips;
//     2. "noriu pridėti studijų programą"      → the programme form (not the menu);
//     3. "sukurk grupę Automechanikai 2026"     → the cohort form / programme pick;
//     4. "pakviesk studentą vardenis@example.com" → the invite form with the e-mail
//        prefilled and NOT submitted (the walk never presses the button);
//     5. "rodyk programas"                      → the institution's real programmes;
//     6. the four open questions a lecturer asks (who fits this employer, what skills
//        my students lack, programme outcomes, where can my students do practice) —
//        recorded verbatim; each is classified in the lane report, never asserted
//        as "must work" here, because they are the gap map, not the proof;
//     7. /dashboard/company renders the programmes + learners sections for a
//        training_provider organisation, in college words.
//   LEARNER:
//     8. the first screen names the institution the student studies with;
//     9. "kur galiu atlikti praktiką?" → honest "nothing visible" PLUS next steps
//        (chips), never a dead end (G-C2);
//    10. "ką man mokytis?" → the compass answer; "ką man daryti toliau?" answers.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-education-real-use-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const LEARNER = "e2e-learner-202609021634@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
// Before lane C's fix is deployed the learner's internship answer is a dead end and
// the four lecturer questions get the worker's answers; set GC2_FIXED=1 once the
// build carries fix/cc/w6-education-real-use to assert both (post-merge proof).
const GC2_FIXED = process.env.GC2_FIXED === "1";
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-education-real-use"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };
const note = (name, detail) => log({ observe: name, detail });

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);

  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const mint = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return sess.session;
  };
  const session = async (email) => "base64-" + Buffer.from(JSON.stringify(await mint(email))).toString("base64url");
  // Residue guard: the walk creates nothing — the institution's own education
  // row counts must be identical before and after. Counted AS THE INSTITUTION
  // through RLS (service_role holds no grant on the education tables — by
  // design, revoked default privileges), one id at most per table.
  const counts = async () => {
    const s = await mint(COMPANY);
    const asInstitution = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer " + s.access_token } },
    });
    const n = async (t, col, f) => { let q = asInstitution.from(t).select(col, { count: "exact" }).range(0, 0); if (f) q = f(q); const r = await q; if (r.error) throw new Error(t + ": " + JSON.stringify(r.error)); return r.count; };
    return {
      programs: await n("education_programs", "id"),
      cohorts: await n("education_cohorts", "id"),
      members: await n("education_cohort_members", "cohort_id"),
      studentInvitations: await n("invitations", "id", (q) => q.eq("relationship_slug", "student")),
    };
  };
  const before = await counts(); log({ step: "counts_before", ...before });

  const b = await chromium.launch();
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    return { c, p, failed };
  };
  const firstScreen = async (p) => {
    // Let the greeting and the opening brief land before reading.
    await p.waitForTimeout(9000);
    const thread = p.getByTestId("conversation-thread");
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    return { text: bubbles.join(" ").replace(/\s+/g, " ").trim(), chips: chips.filter(Boolean).slice(0, 12) };
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
        (await thread.locator("form").count()) > 0;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    await p.waitForTimeout(6000);
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    const fields = await thread.locator("[data-testid^='field-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))).catch(() => []);
    return { text, results, firstAnswerMs, chips: chips.filter(Boolean).slice(-8), fields: [...new Set(fields)].slice(0, 12) };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const headings = (p) => p.locator("main h1, main h2, main h3, main [data-testid$='-section'] h2").allInnerTexts().catch(() => []);
  const sectionTestIds = (p) => p.locator("[data-testid*='institution'], [data-testid*='programme'], [data-testid*='program'], [data-testid*='learner']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))).catch(() => []);

  // ── INSTITUTION, desktop ──────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 800 });
    let first = await firstScreen(p);
    if (!/Veikiate/i.test(first.text)) {
      // The shared E2E identity may have been left in its PERSONAL space by
      // another walker (window 6 runs several lanes on the same identities).
      // A real person switches through the product's own door: the chat
      // answers an institution sentence with the "act as <organisation>" chip.
      const sw = await ask(p, "rodyk programas");
      const chip = p.getByTestId("conversation-thread").getByRole("button", { name: /E2E Walker UAB/ }).first();
      if (await chip.count()) { await chip.click(); await p.waitForTimeout(9000); first = await firstScreen(p); }
      note("institution: entered the company space via the product's switch chip", { offered: sw.chips, switched: /Veikiate/i.test(first.text) });
    }
    log({ leg: "institution_first_screen", ...first });
    must("first screen speaks of students/programmes, not workers", /student|program|grup|mokin/i.test(first.text + " " + first.chips.join(" ")), { text: first.text.slice(0, 220), chips: first.chips });
    must("first screen does not open with 'Man reikia darbuotojų' as the first chip", !/reikia darbuotoj/i.test(first.chips[0] ?? ""), first.chips);
    await shot(p, "01-institution-first-screen");

    const a = await ask(p, "noriu pridėti studijų programą");
    log({ leg: "institution_add_programme", ...a });
    must("'noriu pridėti studijų programą' opens the programme form or the programmes answer", a.fields.some((f) => /field-(name|targetProfessionSlug)/.test(f)) || /program/i.test(a.text), { fields: a.fields, text: a.text.slice(0, 160) });
    must("it is not the not-understood menu", !/Galiu padėti su/i.test(a.text), a.text.slice(0, 160));
    await shot(p, "02-institution-add-programme");

    const g = await ask(p, "sukurk grupę Automechanikai 2026");
    log({ leg: "institution_create_cohort", ...g });
    must("'sukurk grupę …' reaches the cohort step (form, programme pick or programmes answer)", g.fields.some((f) => /field-(name|programId|startsOn)/.test(f)) || /grup|program/i.test(g.text), { fields: g.fields, text: g.text.slice(0, 160) });
    await shot(p, "03-institution-create-cohort");

    const inv = await ask(p, "pakviesk studentą vardenis@example.com");
    log({ leg: "institution_invite_student", ...inv });
    const emailField = p.getByTestId("field-email");
    const emailValue = (await emailField.count()) ? await emailField.first().inputValue().catch(() => null) : null;
    must("'pakviesk studentą <email>' opens the invite form with the e-mail prefilled (NOT submitted)", emailValue === "vardenis@example.com", { emailValue, fields: inv.fields });
    await shot(p, "04-institution-invite-form-unsubmitted");

    const show = await ask(p, "rodyk programas");
    log({ leg: "institution_show_programmes", ...show });
    must("'rodyk programas' lists the institution's real programme(s) or says honestly there are none", /Jūsų programos|Programų dar nėra|kursas/i.test(show.text), show.text.slice(0, 200));
    await shot(p, "05-institution-show-programmes");

    // Post-fix (lane C branch): each question is answered AS THE INSTITUTION —
    // outcomes from the k-anonymous read, the privacy boundary stated for
    // skills / fit, and how internships reach students — never the owner's
    // own worker answer ("Nieko netrūksta: turi visus įgūdžius…").
    for (const [leg, sentence, expect] of [
      ["institution_q_fit_employer", "kurie studentai tinka šiam darbdaviui?", /nemato studentų įgūdžių/i],
      ["institution_q_skills_missing", "kokių įgūdžių trūksta mano studentams?", /nemato studentų įgūdžių/i],
      ["institution_q_outcomes", "rodyk programos rezultatus", /Prisijungę studentai: \d+/i],
      ["institution_q_practice", "kur mano studentai gali atlikti praktiką?", /Praktikos vietas skelbia darbdaviai/i],
    ]) {
      const r = await ask(p, sentence);
      log({ leg, sentence, text: r.text.slice(0, 320), chips: r.chips, fields: r.fields, results: r.results });
      note(leg + " understood (not the menu)", !/Galiu padėti su/i.test(r.text));
      if (GC2_FIXED) must(leg + ": answered as the institution", expect.test(r.text) && !/turi visus įgūdžius|tau nieko nematoma/i.test(r.text), r.text.slice(0, 240));
      else note(leg + " (pre-fix build) answered as the institution", expect.test(r.text));
    }
    await shot(p, "06-institution-open-questions");

    // Visual surfaces of the institution.
    await p.goto(HOST + "/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(6000);
    const hs = await headings(p); const ids = await sectionTestIds(p);
    const body = (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ leg: "institution_company_page", headings: hs.slice(0, 30), testids: [...new Set(ids)].slice(0, 20) });
    must("/dashboard/company shows the programmes section for a training_provider org", /program/i.test(hs.join(" ")) || ids.some((i) => /program/i.test(i ?? "")), hs.slice(0, 20));
    must("/dashboard/company shows the learners section", /student|mokin|besimokan/i.test(hs.join(" ")) || ids.some((i) => /learner/i.test(i ?? "")), hs.slice(0, 20));
    must("no internal vocabulary on the institution page (roster/workspace/RPC/kohorta)", !/\b(roster|workspace|rpc|kohort)/i.test(body), body.match(/\b(roster|workspace|rpc|kohort)\w*/gi));
    await shot(p, "07-institution-company-page");

    await p.goto(HOST + "/lt/dashboard/network?relationship=student", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(5000);
    const nh = await headings(p);
    log({ leg: "institution_network_student", headings: nh.slice(0, 20) });
    await shot(p, "08-institution-network-student");
    log({ leg: "institution_failed_requests", failed: failed.slice(0, 8) });
    await c.close();
  }

  // ── INSTITUTION, mobile first screen + company page ───────────────────────
  {
    const { c, p } = await open(COMPANY, { width: 390, height: 844 });
    const first = await firstScreen(p);
    log({ leg: "institution_first_screen_mobile", ...first });
    must("mobile first screen offers the institution's next steps", first.chips.length > 0, first.chips);
    await shot(p, "09-institution-first-screen-390");
    await p.goto(HOST + "/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(6000);
    const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    must("company page does not overflow horizontally at 390 px", !wide, { wide });
    await shot(p, "10-institution-company-page-390");
    await c.close();
  }

  // ── LEARNER ───────────────────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(LEARNER, { width: 390, height: 844 });
    const first = await firstScreen(p);
    log({ leg: "learner_first_screen", ...first });
    must("learner's first screen names the institution", /E2E Walker/i.test(first.text), first.text.slice(0, 240));
    await shot(p, "11-learner-first-screen");

    const pr = await ask(p, "kur galiu atlikti praktiką?");
    log({ leg: "learner_internship", ...pr });
    must("'kur galiu atlikti praktiką?' is understood (praktika named in the answer or a board)", /praktik/i.test(pr.text) || pr.results > 0, pr.text.slice(0, 200));
    if (GC2_FIXED) {
      must("G-C2: zero internships is answered with next steps (chips), not a dead end", pr.chips.length > 0 && /kompas|profes|įstaig|kryptį|toliau/i.test(pr.text + " " + pr.chips.join(" ")), { text: pr.text.slice(0, 300), chips: pr.chips });
    } else {
      note("G-C2 (pre-fix build): internship answer chips", { chips: pr.chips, text: pr.text.slice(0, 300) });
    }
    await shot(p, "12-learner-internship");

    const k = await ask(p, "ką man mokytis?");
    log({ leg: "learner_compass", ...k });
    must("'ką man mokytis?' answers with the compass", /Tampu|Tapsiu|Įrodym|Tinka|Trūksta|kompas/i.test(k.text), k.text.slice(0, 240));
    await shot(p, "13-learner-compass");

    const nx = await ask(p, "ką man daryti toliau?");
    log({ leg: "learner_next", ...nx });
    // Answered with the profile-completion panel ("Išsaugota 0 iš 6 esminių
    // dalių…", a result panel outside msg-assistant) and its chips.
    must("'ką man daryti toliau?' answers (panel or text with chips), not the not-understood menu", (nx.text.length > 0 || nx.chips.length > 0) && !/Galiu padėti su/i.test(nx.text), { text: nx.text.slice(0, 240), chips: nx.chips });
    await shot(p, "14-learner-next");

    await p.goto(HOST + "/lt/dashboard/profile", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(6000);
    const ptext = (await p.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ leg: "learner_profile", institutionNamed: /E2E Walker/i.test(ptext), compass: /kompas/i.test(ptext) });
    await shot(p, "15-learner-profile");
    log({ leg: "learner_failed_requests", failed: failed.slice(0, 8) });
    await c.close();
  }

  await b.close();
  const after = await counts(); log({ step: "counts_after", ...after });
  must("zero residue: education row counts unchanged", JSON.stringify(before) === JSON.stringify(after), { before, after });
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})();
