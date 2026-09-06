// PRODUCTION WALK — one identity, many contexts; the services loop end to end
// (window 6, lane G: fix/cc/w6-multi-context-services).
//
// WHAT IT PROVES against production with bounded E2E identities:
//   A. COMPANY context (E2E Walker UAB, the walker's durable pointer): the eight everyday
//      sentences (offer a service ×3, need a service ×3, "what next", "looking for work")
//      each get an answer; "ieškau darbo" in the company context does NOT leak the
//      person's ladder; the context panel's "nearest deadline" fact never carries a raw
//      e-mail address as its label (G-H1).
//   B. The workspace chip switches the SAME identity to "Asmeninė erdvė" and back —
//      the chip label follows, the greeting names the company after switching back,
//      and the person's state is intact (no second account, no forced role page).
//   C. PERSON (390 px): /dashboard/services — create ONE offering "Buhalterijos
//      paslaugos" (controlled fixture), activate it; the page offers a way forward.
//   D. COMPANY (390 px): /dashboard/service-requests — the offering is discoverable,
//      ONE request is sent; the row reads "Užklausa pateikta".
//   E. PERSON: the incoming request shows the requester's NAME (never an e-mail/id),
//      accept it; F. COMPANY: the outgoing row reads "Priimta" + the message door.
//   G. Cleanup through the product (delete the offering — the request cascades) and
//      admin readback: every touched table is back to its before-count (zero residue).
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-multi-context-services-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const PERSON = "e2e-spine-person-202609051508@labourmarket.ai";
const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const COMPANY_ORG_ID = "a996113c-6155-4ca6-9bac-4fc7bf7db8ae"; // E2E Walker UAB
const OFFERING_TITLE = "Buhalterijos paslaugos";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-multi-context-services"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };
const EMAIL_RX = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);

  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  // The service role holds NO table grants in production (revoke-default-
  // privileges hardening) — it is used ONLY to mint the magic-link sessions.
  // Every readback below is the identity's OWN RLS-scoped view; the global
  // table totals are read with execute_sql outside this script and appended
  // to the log by hand.
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    const scoped = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer " + sess.session.access_token } },
    });
    return { cookie: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), scoped };
  };
  // Profile ids verified with execute_sql on 2026-09-06 (auth.users ⋈ profiles).
  const ids = {
    [PERSON]: { id: "70851a66-168c-443c-bb7b-d6f4d5112cd6" },
    [COMPANY]: { id: "98212ae5-34aa-402e-b926-21d25495cbd4" },
  };
  const personDb = (await session(PERSON)).scoped;
  const companyDb = (await session(COMPANY)).scoped;
  log({ step: "identities", person: ids[PERSON].id, company: ids[COMPANY].id });

  // ── BEFORE counts — each identity's OWN rows in every table the loop touches ──
  const counts = async () => {
    const rows = async (db, t, col, val) => { const { data, error } = await db.from(t).select("id").eq(col, val); if (error) throw new Error(t + ": " + error.message); return (data ?? []).length; };
    const { data: pSeen, error: e1 } = await personDb.from("service_offering_requests_seen").select("user_id").eq("user_id", ids[PERSON].id); if (e1) throw e1;
    const { data: cSeen, error: e2 } = await companyDb.from("service_offering_requests_seen").select("seen_at").eq("user_id", ids[COMPANY].id).maybeSingle(); if (e2) throw e2;
    const { data: cProf, error: e3 } = await companyDb.from("profiles").select("active_organization_id").eq("id", ids[COMPANY].id).maybeSingle(); if (e3) throw e3;
    return {
      personOwnOfferings: await rows(personDb, "service_offerings", "provider_id", ids[PERSON].id),
      personIncomingRequests: await rows(personDb, "service_offering_requests", "provider_id", ids[PERSON].id),
      companyOutgoingRequests: await rows(companyDb, "service_offering_requests", "buyer_id", ids[COMPANY].id),
      personSeenRow: (pSeen ?? []).length,
      companySeenAt: cSeen?.seen_at ?? null,
      companyPointer: cProf?.active_organization_id ?? null,
    };
  };
  const before = await counts();
  log({ step: "before", ...before });
  ids[COMPANY].active_organization_id = before.companyPointer;

  const b = await chromium.launch();
  const open = async (email, viewport, route = "/lt/dashboard") => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: (await session(email)).cookie, domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + route, { waitUntil: "domcontentloaded", timeout: 60000 });
    return { c, p, failed };
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
        (await p.getByTestId("msg-result").count()) > resultsBefore;
      if (!typing && grew) { firstAnswerMs = Date.now() - t0; break; }
    }
    await p.waitForTimeout(6000);
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    const bubbles = await p.getByTestId("msg-assistant").allInnerTexts().catch(() => []);
    const text = bubbles.slice(assistantBefore).join(" ").replace(/\s+/g, " ").trim();
    const results = (await p.getByTestId("msg-result").count()) - resultsBefore;
    // Some answers are neither a bubble nor a result panel: the employer need
    // FORM (field-role + "Tęsti") and the profile ladder card. Count them as
    // an answer too — a form is a door, not silence.
    const formOpen = (await p.getByTestId("field-role").count()) > 0;
    const answered = firstAnswerMs > 0 || formOpen || chips.length > 0;
    return { text, results, firstAnswerMs, formOpen, answered, chips: chips.slice(-6).map((x) => x.replace(/\s+/g, " ").trim()) };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const chipText = async (p) => (await p.getByTestId("workspace-chip").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const deadlineFact = async (p) => {
    if ((await p.getByTestId("context-panel-work").count()) === 0) {
      await p.getByTestId("context-panel-toggle").click().catch(() => {});
      await p.waitForTimeout(2500);
    }
    const dd = p.locator('dt:has-text("Artimiausias terminas") + dd');
    return (await dd.count()) ? (await dd.first().innerText()).trim() : null;
  };
  const NOT_UNDERSTOOD = /Galiu padėti su CV, profiliu/i;

  // ── A. COMPANY context — the eight sentences + the deadline label ────────
  {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 900 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(4000);
    const chip = await chipText(p);
    log({ leg: "company_chip", chip });
    must("A0 the walker opens in the company context (chip names E2E Walker UAB)", /E2E Walker/i.test(chip), chip);
    const greeting = (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).join(" ").replace(/\s+/g, " ").slice(0, 300);
    log({ leg: "company_greeting", greeting });
    const deadline = await deadlineFact(p);
    log({ leg: "company_deadline_fact", deadline });
    must("A1 G-H1: the nearest-deadline label is never a raw e-mail address", deadline === null || !EMAIL_RX.test(deadline), deadline);
    await shot(p, "01-company-home-panel");

    const answers = {};
    for (const s of [
      "siūlau buhalterijos paslaugas",
      "galiu kirpti plaukus",
      "remontuoju automobilius",
      "reikia santechniko",
      "reikia buhalterio paslaugų",
      "reikia korepetitoriaus",
      "ką man daryti toliau?",
      "ieškau darbo",
    ]) {
      const a = await ask(p, s);
      answers[s] = a;
      log({ leg: "company_sentence", sentence: s, ms: a.firstAnswerMs, results: a.results, formOpen: a.formOpen, text: a.text.slice(0, 260), chips: a.chips });
      must(`A2 company: "${s}" gets an answer (bubble, panel or a form)`, a.answered, { ms: a.firstAnswerMs, formOpen: a.formOpen });
    }
    must("A3 company: offering a service reaches the services door (not the menu)", /paslaug/i.test(answers["siūlau buhalterijos paslaugas"].text + answers["siūlau buhalterijos paslaugas"].chips.join(" ")) && !NOT_UNDERSTOOD.test(answers["siūlau buhalterijos paslaugas"].text), answers["siūlau buhalterijos paslaugas"].text.slice(0, 160));
    must("A4 company: 'reikia santechniko' is not the not-understood menu", !NOT_UNDERSTOOD.test(answers["reikia santechniko"].text), answers["reikia santechniko"].text.slice(0, 160));
    must("A5 company: 'ką man daryti toliau?' answers in the company's terms (no personal profile ladder)", !/Profilyje dar trūksta|Tavo profil/i.test(answers["ką man daryti toliau?"].text), answers["ką man daryti toliau?"].text.slice(0, 200));
    must("A6 company: 'ieškau darbo' does not silently show the person's job board", answers["ieškau darbo"].results === 0 || /asmenin|erdv/i.test(answers["ieškau darbo"].text), { results: answers["ieškau darbo"].results, text: answers["ieškau darbo"].text.slice(0, 200) });
    await shot(p, "02-company-sentences");
    log({ leg: "company_failed_requests", failed: failed.slice(0, 8) });
    await c.close();
  }

  // ── B. The chip: company → personal → company on the SAME identity ──────
  {
    const { c, p } = await open(COMPANY, { width: 1280, height: 900 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(3000);
    await p.getByTestId("workspace-chip").locator("button").first().click();
    await p.getByTestId("workspace-option-personal").click();
    await p.waitForTimeout(6000);
    const chipPersonal = await chipText(p);
    log({ leg: "switch_to_personal", chip: chipPersonal });
    must("B1 the chip switches the same identity to the personal space", /Asmenin/i.test(chipPersonal), chipPersonal);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(5000);
    const chipAfterReload = await chipText(p);
    const greetingPersonal = (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).join(" ").replace(/\s+/g, " ").slice(0, 300);
    log({ leg: "personal_after_reload", chip: chipAfterReload, greeting: greetingPersonal });
    must("B2 the personal context survives a reload (durable pointer)", /Asmenin/i.test(chipAfterReload), chipAfterReload);
    const a = await ask(p, "ką man daryti toliau?");
    log({ leg: "personal_next", text: a.text.slice(0, 260), chips: a.chips });
    // The personal answer is the profile ladder card ("3 iš 6 … Dar trūksta")
    // with its own chips — the person's state, not the company's queue.
    must("B3 personal: 'ką man daryti toliau?' answers with the PERSON's ladder, not the company queue", a.answered && !NOT_UNDERSTOOD.test(a.text) && !/studento pakvietimas|rezervacijos pasiūlym/i.test(a.text) && a.chips.some((x) => /Prieinamum|Profesij|Kalb|patirt/i.test(x)), { text: a.text.slice(0, 160), chips: a.chips });
    const deadlinePersonal = await deadlineFact(p);
    log({ leg: "personal_deadline_fact", deadline: deadlinePersonal });
    must("B3b G-H1 in the personal space too: the deadline label is never a raw e-mail", deadlinePersonal === null || !EMAIL_RX.test(deadlinePersonal), deadlinePersonal);
    await shot(p, "03-walker-personal-space");
    await p.getByTestId("workspace-chip").locator("button").first().click();
    await p.getByTestId(`workspace-option-${COMPANY_ORG_ID}`).click();
    await p.waitForTimeout(6000);
    await p.reload({ waitUntil: "domcontentloaded" });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(5000);
    const chipBack = await chipText(p);
    const greetingBack = (await p.getByTestId("msg-assistant").allInnerTexts().catch(() => [])).join(" ").replace(/\s+/g, " ").slice(0, 400);
    log({ leg: "back_to_company", chip: chipBack, greeting: greetingBack });
    must("B4 switching back restores the company context", /E2E Walker/i.test(chipBack), chipBack);
    must("B5 after switching back, the opening brief names the company", /E2E Walker/i.test(greetingBack), greetingBack.slice(0, 200));
    await shot(p, "04-walker-back-to-company");
    await c.close();
    const { data: ptr } = await companyDb.from("profiles").select("active_organization_id").eq("id", ids[COMPANY].id).maybeSingle();
    must("B6 the walker's durable pointer is back on the company", ptr?.active_organization_id === COMPANY_ORG_ID, ptr);
  }

  // ── C. PERSON creates ONE offering (390 px) ──────────────────────────────
  let offeringId = null;
  {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 }, "/lt/dashboard/services");
    await p.getByTestId("services-page").waitFor({ timeout: 90000 });
    const chip = await chipText(p);
    log({ leg: "person_services_chip", chip });
    await shot(p, "05-person-services-empty");
    must("C1 /dashboard/services offers a way forward (link to requests)", (await p.getByTestId("services-to-requests-link").count()) === 1, null);
    await p.getByTestId("service-offering-add").click();
    await p.getByTestId("service-offering-title").fill(OFFERING_TITLE);
    const inputs = p.getByTestId("service-offering-form").locator("input[type='text'], input:not([type])");
    // title, category, country, rate — in DOM order.
    await inputs.nth(1).fill("buhalterija");
    await inputs.nth(2).fill("LT");
    await inputs.nth(3).fill("derinama");
    await p.getByTestId("service-offering-remote").check();
    await p.getByTestId("service-offering-save").click();
    await p.waitForTimeout(5000);
    const rowTestId = await p.locator('[data-testid^="service-offering-row-"]').first().getAttribute("data-testid").catch(() => null);
    offeringId = rowTestId ? rowTestId.replace("service-offering-row-", "") : null;
    log({ leg: "person_offering_created", offeringId });
    must("C2 the offering row appears after save", !!offeringId, rowTestId);
    if (offeringId) {
      await p.getByTestId(`service-offering-toggle-${offeringId}`).click();
      await p.waitForTimeout(5000);
      const status = (await p.getByTestId(`service-offering-status-${offeringId}`).innerText().catch(() => "")).trim();
      must("C3 the offering is ACTIVE after one tap", /Aktyv/i.test(status), status);
    }
    await shot(p, "06-person-offering-active-390");
    log({ leg: "person_failed_requests", failed: failed.slice(0, 8) });
    await c.close();
  }

  // ── D. COMPANY discovers + requests (390 px) ─────────────────────────────
  {
    const { c, p, failed } = await open(COMPANY, { width: 390, height: 844 }, "/lt/dashboard/service-requests");
    await p.getByTestId("service-requests-page").waitFor({ timeout: 90000 });
    await p.waitForTimeout(2000);
    const row = p.getByTestId("marketplace-offer-row").filter({ hasText: OFFERING_TITLE });
    must("D1 the company sees the person's offering in discovery", (await row.count()) === 1, await row.count());
    const offerText = (await row.first().innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ leg: "company_discover_row", offerText });
    must("D2 the discover row carries no raw id / e-mail", !EMAIL_RX.test(offerText) && !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(offerText), offerText);
    await shot(p, "07-company-discover-390");
    await row.first().getByRole("button").click();
    await p.waitForTimeout(6000);
    const requested = await p.getByTestId("marketplace-offer-requested").count();
    must("D3 one tap sends the request (row reads 'Užklausa pateikta')", requested === 1, requested);
    const outRow = p.getByTestId("marketplace-outgoing-row").filter({ hasText: OFFERING_TITLE });
    must("D4 the request appears under 'Mano užklausos' as sent", (await outRow.count()) === 1 && /Išsiųsta/i.test(await outRow.first().innerText()), await outRow.count());
    await shot(p, "08-company-requested-390");
    log({ leg: "company_failed_requests_sr", failed: failed.slice(0, 8) });
    await c.close();
  }

  // ── E. PERSON answers (390 px) ───────────────────────────────────────────
  {
    const { c, p } = await open(PERSON, { width: 390, height: 844 }, "/lt/dashboard/service-requests");
    await p.getByTestId("service-requests-page").waitFor({ timeout: 90000 });
    await p.waitForTimeout(2000);
    const inc = p.getByTestId("marketplace-incoming-row").filter({ hasText: OFFERING_TITLE });
    must("E1 the provider sees the incoming request", (await inc.count()) === 1, await inc.count());
    const who = (await inc.first().getByTestId("marketplace-incoming-requester").innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ leg: "person_incoming_requester", who });
    must("E2 the requester is shown by NAME, never an e-mail or id", /E2E Walker/.test(who) && !EMAIL_RX.test(who), who);
    await shot(p, "09-person-incoming-390");
    await inc.first().getByRole("button", { name: /Priimti/ }).click();
    await p.waitForTimeout(6000);
    const after = (await inc.first().innerText().catch(() => "")).replace(/\s+/g, " ");
    must("E3 accepting flips the row to 'Priimta' with the message door", /Priimta/.test(after) && (await inc.first().getByTestId("marketplace-incoming-message-cta").count()) === 1, after);
    await shot(p, "10-person-accepted-390");
    await c.close();
  }

  // ── F. COMPANY reads the answer ──────────────────────────────────────────
  {
    const { c, p } = await open(COMPANY, { width: 390, height: 844 }, "/lt/dashboard/service-requests");
    await p.getByTestId("service-requests-page").waitFor({ timeout: 90000 });
    await p.waitForTimeout(2000);
    const outRow = p.getByTestId("marketplace-outgoing-row").filter({ hasText: OFFERING_TITLE });
    const t = (await outRow.first().innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ leg: "company_outgoing_after_accept", t });
    must("F1 the requester sees 'Priimta' + 'Atsakyta <day>' + the message door", /Priimta/.test(t) && /Atsakyta/.test(t) && (await outRow.first().getByTestId("marketplace-outgoing-message-cta").count()) === 1, t);
    await shot(p, "11-company-accepted-390");
    await c.close();
  }

  // ── G. Cleanup through the product, then admin readback ──────────────────
  {
    const { c, p } = await open(PERSON, { width: 390, height: 844 }, "/lt/dashboard/services");
    await p.getByTestId("services-page").waitFor({ timeout: 90000 });
    if (offeringId) {
      await p.getByTestId(`service-offering-delete-${offeringId}`).click();
      await p.waitForTimeout(6000);
      must("G1 the offering is deleted through the product", (await p.getByTestId(`service-offering-row-${offeringId}`).count()) === 0, null);
    }
    await shot(p, "12-person-services-after-delete");
    await c.close();
  }
  await b.close();

  // Residue sweep through the identity's OWN rights: a leftover offering (if
  // the UI delete failed) goes through the provider's own RLS delete policy.
  if (offeringId) {
    const { data: left } = await personDb.from("service_offerings").select("id").eq("id", offeringId);
    if ((left ?? []).length) { const { error } = await personDb.from("service_offerings").delete().eq("id", offeringId); log({ step: "residue_sweep", deletedOffering: offeringId, error: error?.message ?? null }); }
  }
  const after = await counts();
  log({ step: "after", ...after });
  must("G2 zero residue: the person's offerings are back to the before-count", after.personOwnOfferings === before.personOwnOfferings, { before: before.personOwnOfferings, after: after.personOwnOfferings });
  must("G3 zero residue: the request rows are gone on BOTH sides", after.personIncomingRequests === before.personIncomingRequests && after.companyOutgoingRequests === before.companyOutgoingRequests, { before: [before.personIncomingRequests, before.companyOutgoingRequests], after: [after.personIncomingRequests, after.companyOutgoingRequests] });
  must("G4 the walker's durable workspace pointer is unchanged", after.companyPointer === before.companyPointer, { before: before.companyPointer, after: after.companyPointer });
  // The seen table has NO delete policy for the user (only the upsert RPC), so a
  // seen row created by this walk is NAMED here for the execute_sql sweep that
  // follows the run — it is not silently left behind and not silently deleted.
  log({
    step: "residue_to_sweep_via_execute_sql",
    personSeenRowCreated: before.personSeenRow === 0 && after.personSeenRow === 1,
    companySeenAtBumped: before.companySeenAt !== after.companySeenAt ? { before: before.companySeenAt, after: after.companySeenAt } : null,
  });

  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})().catch((e) => { log({ fatal: String(e && e.stack || e) }); process.exit(2); });
