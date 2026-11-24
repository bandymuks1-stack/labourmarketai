// PRODUCTION WALK — D5: the AGENCY-origin chain, end to end, through the REAL UI.
//
//   S1 AGENCY  "pakviesk kandidatą <person>"      → roster invitation (company_worker_invitations)
//   S2 PERSON  "mano kvietimai" → Priimti → confirm → agency roster link (company_workers)
//   S3 AGENCY  "parodyk klientų poreikius" / "pasiūlyk kandidatą" → agency_candidate_offers (offered)
//   S4 CLIENT  "kokius kandidatus pasiūlė agentūra?" → Priimti chip → canonical booking (proposed)
//   S5 PERSON  "ką man siūlo?" → Priimti → Taip, patvirtinti → booking accepted + company_worker_engagements row
//   S6 CLIENT  "mano projektai" → project → "Priskirti" chips (chat picker — measured);
//              /dashboard/projects assign form — the `list_booking_engagement_workers_v1` picker
//              (optgroup assign-engagement-group) → project_worker_assignments row
//   S7 PERSON  "šiandien dirbau nuo 8 iki 17 …" → worklog flow (two-step save) → journal_entries row; "mano žurnalas"
//   S8 CLIENT  "kas pas mane dirba" → the relationship is visible to the employer
//
// Identities (bounded E2E, production): agency e2e-timing (E2E Agentūra UAB (testinis subjektas)),
// client e2e-walker (E2E Walker UAB), person e2e-spine-person (E2E Spine Žmogus — NOT on the
// walker's roster; the only path to an assignment is the booking engagement).
// Worker2 is deliberately NOT used: it already holds an ACTIVE engagement with E2E Walker UAB and
// `respond_booking_request_v3` answers `already_active` without a new row for that pair.
//
// DB readback is NOT done here: the service-role client is denied on these tables (42501, the
// known no-grant class). Every row is read back through Supabase MCP execute_sql by the
// orchestrating session and rolled back in reverse dependency order (see README).
//   EXPECT_BUILD=<sha> [START=S3] node walk-d5-agency-chain-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const AGENCY = "e2e-timing-202609021217@labourmarket.ai";
const CLIENT = "e2e-walker-202609021438@labourmarket.ai";
const PERSON = "e2e-spine-person-202609051508@labourmarket.ai";
const PERSON_PROFILE = "70851a66-168c-443c-bb7b-d6f4d5112cd6";
const PERSON_WORKER = "c83fd3d3-d974-4fa9-92eb-8d45af333d19";
const PROJECT = "d9af86de-0538-4a88-bc64-cd149ef497c9"; // "E2E Kauno objektas (testinis)"
const TAG = "E2E-D5-" + Date.now().toString(36);
// Resumable: START=S3 skips the legs already proven on an earlier run (their rows exist).
const START = Number((process.env.START || "S1").replace(/[^0-9]/g, "")) || 1;
const skip = (n) => n < START;

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "shots"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build, tag: TAG, start: "S" + START, startedAt: new Date().toISOString() });
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
    const c = await b.newContext({ viewport, locale: "lt-LT", deviceScaleFactor: 1 });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(6000); // let the opening brief land BEFORE we speak (we want the FINAL chip row)
    return { c, p, failed };
  };
  const settle = async (p, assistantBefore, resultsBefore, maxMs) => {
    const t0 = Date.now();
    let firstAnswerMs = -1;
    while (Date.now() - t0 < maxMs) {
      await p.waitForTimeout(1000);
      const typing = await p.getByTestId("chat-typing").count();
      const grew = (await p.getByTestId("msg-assistant").count()) > assistantBefore || (await p.getByTestId("msg-result").count()) > resultsBefore;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    await p.waitForTimeout(4000);
    const chips = await p.getByTestId("conversation-thread").locator("button").allInnerTexts().catch(() => []);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    return { text, results, firstAnswerMs, chips: chips.slice(-8) };
  };
  const ask = async (p, sentence, maxMs = 45000) => {
    const assistantBefore = await p.getByTestId("msg-assistant").count();
    const resultsBefore = await p.getByTestId("msg-result").count();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    return settle(p, assistantBefore, resultsBefore, maxMs);
  };
  const tap = async (p, locator, maxMs = 30000) => {
    const assistantBefore = await p.getByTestId("msg-assistant").count();
    const resultsBefore = await p.getByTestId("msg-result").count();
    await locator.click();
    return settle(p, assistantBefore, resultsBefore, maxMs);
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const body = (p) => p.locator("body").innerText();
  // The ONE inline form: (optional field fill) → Tęsti → review → Išsaugoti → done.
  const inlineForm = async (p, actionId, fill) => {
    const form = p.getByTestId("inline-action-form-" + actionId);
    await form.waitFor({ timeout: 45000 });
    if (fill) await fill(form);
    await p.getByTestId("inline-action-continue").last().click();
    await p.getByTestId("inline-action-review").last().waitFor({ timeout: 30000 });
    await p.getByTestId("inline-action-save").last().click();
    await p.getByTestId("inline-action-done").last().waitFor({ timeout: 60000 });
    await p.waitForTimeout(1500);
  };
  const t0 = Date.now();

  // ── S1. AGENCY invites the person to its roster, by sentence ─────────────
  if (!skip(1)) {
    const { c, p, failed } = await open(AGENCY, { width: 390, height: 844 });
    const a = await ask(p, "pakviesk kandidatą " + PERSON, 30000);
    log({ leg: "S1_agency_invite_sentence", ...a });
    await shot(p, "10-agency-invite-form");
    await inlineForm(p, "company.invite-worker", async (form) => {
      const email = form.locator('input[type="email"], input[name="email"]').first();
      if (await email.count()) { const v = await email.inputValue(); if (!v) await email.fill(PERSON); }
    });
    const t = await body(p);
    const said = (t.match(/Kvietimas įrašytas[^\n]{0,160}|Pakvietimas[^\n]{0,160}|Kvietimas[^\n]{0,160}/) || [null])[0];
    log({ leg: "S1_agency_invite_done", ms: Date.now() - t0, said });
    must("S1 the roster invitation is recorded by sentence (readback names the real state)", /Kvietimas įrašytas/.test(t), said);
    await shot(p, "11-agency-invited");
    log({ leg: "S1_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S2. PERSON accepts the roster invitation in the chat ─────────────────
  if (!skip(2)) {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 });
    const a = await ask(p, "mano kvietimai", 30000);
    log({ leg: "S2_person_invitations", ...a });
    await shot(p, "20-person-invitations");
    const accept = p.getByTestId("conversation-invitation-accept");
    must("S2 the agency's roster invitation is offered with an accept control", (await accept.count()) > 0, await accept.count());
    if (await accept.count()) {
      await accept.first().click();
      await p.getByTestId("conversation-invitation-confirm").first().waitFor({ timeout: 20000 });
      await shot(p, "21-person-invitation-confirm");
      await p.getByTestId("conversation-invitation-confirm").first().click();
      await p.getByTestId("conversation-invitation-done").first().waitFor({ timeout: 60000 });
      const done = (await p.getByTestId("conversation-invitation-done").first().innerText()).slice(0, 200);
      log({ leg: "S2_person_accepted", ms: Date.now() - t0, done });
      must("S2 acceptance readback says the link now exists", /Priimta/.test(done), done);
      await shot(p, "22-person-invitation-done");
    }
    log({ leg: "S2_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S3. AGENCY proposes the person for the client's shared need ──────────
  if (!skip(3)) {
    const { c, p, failed } = await open(AGENCY, { width: 390, height: 844 });
    const d = await ask(p, "parodyk klientų poreikius", 30000);
    log({ leg: "S3_client_demand", ...d });
    must("S3 the shared need 'Suvirintojas' is listed", /Suvirintoj/.test(d.text), d.text.slice(0, 200));
    await shot(p, "30-agency-client-demand");
    const pr = await ask(p, "pasiūlyk kandidatą", 30000);
    log({ leg: "S3_propose_sentence", ...pr });
    let options = [];
    await inlineForm(p, "agency.propose-candidate", async (form) => {
      const select = form.locator("select").first();
      options = await select.locator("option").evaluateAll((els) => els.map((e) => ({ value: e.value, text: e.textContent.trim() })));
      const mine = options.find((o) => o.value === PERSON_WORKER) || options.find((o) => /Spine/i.test(o.text));
      must("S3 the roster select offers the person", !!mine, options);
      if (mine) await select.selectOption(mine.value);
      await shot(p, "31-agency-propose-form");
    });
    const t = await body(p);
    const said = (t.match(/Pasiūlymas įrašytas[^\n]{0,160}/) || [null])[0];
    log({ leg: "S3_proposed", ms: Date.now() - t0, said, options });
    must("S3 the proposal is recorded", !!said, said);
    await shot(p, "32-agency-proposed");
    const st = await ask(p, "kaip sekasi mano pasiūlymams", 30000);
    log({ leg: "S3_status", ...st });
    must("S3 the agency's progress list names the person as 'Pasiūlyta'", /Spine Žmogus · Pasiūlyta/.test(st.text), st.text.slice(0, 300));
    await shot(p, "33-agency-status");
    log({ leg: "S3_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S4. CLIENT accepts the offer by chip → canonical booking ─────────────
  if (!skip(4)) {
    const { c, p, failed } = await open(CLIENT, { width: 390, height: 844 });
    let a = await ask(p, "kokius kandidatus pasiūlė agentūra?", 30000);
    log({ leg: "S4_client_offers", ...a });
    await shot(p, "40-client-offers");
    // #1569 (one identity, many contexts): the question may first ask WHICH space the
    // person acts in. That is one tap, measured here, not a dead end.
    const chooser = p.getByRole("button", { name: "E2E Walker UAB", exact: true }).last();
    if (/pasirinkite erdvę/i.test(a.text) && (await chooser.count())) {
      a = await tap(p, chooser, 30000);
      log({ leg: "S4_client_offers_after_workspace_chip", ...a });
      await shot(p, "40b-client-offers-after-chip");
      if (!/Priimti: /.test(a.chips.join("|"))) {
        a = await ask(p, "kokius kandidatus pasiūlė agentūra?", 30000);
        log({ leg: "S4_client_offers_reasked", ...a });
      }
    }
    const acceptAll = p.getByRole("button", { name: /^Priimti: / });
    const n = await acceptAll.count();
    must("S4 exactly one open offer carries an accept chip", n === 1, { count: n, labels: await acceptAll.allInnerTexts() });
    if (n > 0) {
      await acceptAll.first().click();
      await p.waitForTimeout(9000);
      const t = await body(p);
      const accepted = /Priimta\. Kandidatui išsiųstas rezervacijos pasiūlymas/.test(t);
      log({ leg: "S4_decided", ms: Date.now() - t0, accepted, failed: /Sprendimo išsaugoti nepavyko/.test(t), line: (t.match(/Priimta[^\n]{0,200}|Sprendimo[^\n]{0,200}/) || [null])[0] });
      must("S4 the client's acceptance proposes the canonical booking", accepted, (t.match(/Priimta[^\n]{0,200}|Sprendimo[^\n]{0,200}/) || [null])[0]);
      await shot(p, "41-client-accepted");
    }
    log({ leg: "S4_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S5. PERSON accepts the booking in the chat → engagement row ──────────
  if (!skip(5)) {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 });
    const a = await ask(p, "ką man siūlo?", 30000);
    log({ leg: "S5_person_offers", ...a });
    await shot(p, "50-person-booking-card");
    const accept = p.getByRole("button", { name: /^Priimti/ }).first();
    must("S5 the booking card offers Priimti", (await accept.count()) > 0, await accept.count());
    if (await accept.count()) {
      await accept.click();
      await p.getByTestId("conversation-booking-confirm").first().waitFor({ timeout: 20000 });
      await shot(p, "51-person-booking-confirm");
      await p.getByRole("button", { name: /Taip, patvirtinti/ }).first().click();
      await p.getByTestId("conversation-booking-done").first().waitFor({ timeout: 60000 });
      const done = (await p.getByTestId("conversation-booking-done").first().innerText()).slice(0, 200);
      log({ leg: "S5_person_accepted", ms: Date.now() - t0, done });
      must("S5 the person's acceptance is confirmed", /Priėmei|Priimta/.test(done), done);
      await shot(p, "52-person-booking-done");
    }
    log({ leg: "S5_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S6. CLIENT assigns the person to a project ───────────────────────────
  if (!skip(6)) {
    const { c, p, failed } = await open(CLIENT, { width: 1280, height: 900 });
    // 6a. the chat picker — measured, not assumed
    const pj = await ask(p, "mano projektai", 30000);
    log({ leg: "S6a_projects", ...pj });
    const row = p.getByTestId("project-row-" + PROJECT);
    let chatChips = null;
    if (await row.count()) {
      await row.first().click();
      await p.getByTestId("project-detail").first().waitFor({ timeout: 20000 });
      const btn = p.getByTestId("project-assign-worker");
      if (await btn.count()) {
        const r = await tap(p, btn.first(), 20000);
        chatChips = r.chips;
        log({ leg: "S6a_chat_picker", said: r.text.slice(0, 200), chips: r.chips });
      } else log({ leg: "S6a_chat_picker", said: "no project-assign-worker control" });
    } else log({ leg: "S6a_chat_picker", said: "project row not found", chips: pj.chips });
    await shot(p, "60-client-chat-picker");
    const inChat = !!(chatChips && chatChips.some((x) => /Spine/i.test(x)));
    log({ leg: "S6a_chat_picker_offers_booking_engaged_person", inChat, note: inChat ? "" : "the chat picker reads the ROSTER only (loadAssignableWorkersForProject → listActiveCompanyWorkers); the RPC gate would accept the engagement" });
    // 6b. the page picker over list_booking_engagement_workers_v1
    await p.goto(HOST + "/lt/dashboard/projects", { waitUntil: "domcontentloaded", timeout: 60000 });
    const form = p.getByTestId("project-assign");
    await form.waitFor({ timeout: 60000 });
    const opt = form.locator('select[name="worker_profile_id"] option[value="' + PERSON_PROFILE + '"]');
    const present = (await opt.count()) > 0;
    const group = present ? await opt.evaluate((e) => (e.closest("optgroup") ? e.closest("optgroup").getAttribute("data-testid") : null)) : "absent";
    const groups = await form.locator("optgroup").evaluateAll((els) => els.map((g) => ({ testid: g.getAttribute("data-testid"), label: g.getAttribute("label"), options: Array.from(g.querySelectorAll("option")).map((o) => o.textContent.trim()) })));
    log({ leg: "S6b_page_picker", present, group, groups });
    must("S6b the person is offered by the ENGAGEMENT group of the page picker (not the roster)", group === "assign-engagement-group", group);
    if (present) {
      await form.locator('select[name="project_id"]').selectOption(PROJECT);
      await form.locator('select[name="worker_profile_id"]').selectOption(PERSON_PROFILE);
      await shot(p, "61-client-page-picker");
      await form.locator('button[type="submit"]').click();
      await p.waitForTimeout(8000);
      const t = await body(p);
      const status = (t.match(/Priskirt[^\n]{0,80}/) || [null])[0];
      log({ leg: "S6b_assigned", ms: Date.now() - t0, status });
      must("S6b the page confirms the assignment", !!status, status);
      await shot(p, "62-client-assigned");
    }
    log({ leg: "S6_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S7. PERSON logs work in the chat (two-step save) ─────────────────────
  if (!skip(7)) {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 });
    const a = await ask(p, "šiandien dirbau nuo 8 iki 17 Kauno objekte, klojau plyteles. " + TAG, 30000);
    log({ leg: "S7_worklog_sentence", ...a });
    const flow = p.getByTestId("worklog-flow");
    await flow.waitFor({ timeout: 30000 }).catch(() => {});
    const blocked = await p.getByTestId("worklog-blocked").count();
    const ctx = p.getByTestId("worklog-context");
    const ctxOptions = (await ctx.count()) ? await ctx.locator("option").allInnerTexts() : [];
    log({ leg: "S7_worklog_form", flow: await flow.count(), blocked, contextSelectShown: await ctx.count(), ctxOptions, notes: await p.getByTestId("worklog-notes").inputValue().catch(() => null) });
    await shot(p, "70-person-worklog-form");
    must("S7 the worklog form opens (not blocked)", (await flow.count()) > 0 && blocked === 0, { blocked });
    if (await p.getByTestId("worklog-save").count()) {
      await p.getByTestId("worklog-save").click();
      await p.getByTestId("worklog-confirm").waitFor({ timeout: 20000 });
      await shot(p, "71-person-worklog-confirm");
      await p.getByTestId("worklog-confirm").click();
      await p.getByTestId("worklog-done").waitFor({ timeout: 60000 });
      const done = (await p.getByTestId("worklog-done").innerText()).replace(/\s+/g, " ").slice(0, 300);
      log({ leg: "S7_saved", ms: Date.now() - t0, done });
      must("S7 the journal entry is saved (server outcome shown)", done.length > 0, done);
      await shot(p, "72-person-worklog-done");
    }
    const h = await ask(p, "mano žurnalas", 30000);
    const hasTag = h.text.includes(TAG) || (await body(p)).includes(TAG);
    log({ leg: "S7_person_history", ...h, hasTag });
    must("S7 the person's journal history shows the new entry", hasTag, h.text.slice(0, 300));
    await shot(p, "73-person-history");
    log({ leg: "S7_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── S8. CLIENT sees the relationship ─────────────────────────────────────
  if (!skip(8)) {
    const { c, p, failed } = await open(CLIENT, { width: 1280, height: 900 });
    let e = await ask(p, "kas pas mane dirba", 30000);
    log({ leg: "S8_client_engagements", ...e });
    const chooser = p.getByRole("button", { name: "E2E Walker UAB", exact: true }).last();
    if (/pasirinkite erdvę/i.test(e.text) && (await chooser.count())) {
      e = await tap(p, chooser, 30000);
      log({ leg: "S8_client_engagements_after_workspace_chip", ...e });
    }
    const t = await body(p);
    const listed = /Spine/i.test(e.text) || /Spine/i.test(t);
    await shot(p, "80-client-engagements");
    must("S8 the client's 'who works for me' names the agency-placed person", listed, e.text.slice(0, 300));
    log({ leg: "S8_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  await b.close();
  log({ step: "done", tag: TAG, totalMs: Date.now() - t0, endedAt: new Date().toISOString() });
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
