// Production walk — FULL SPINE with TWO FRESH bounded identities (MASTER completion map §6, Day 5).
// Org at 1280 px (dark scheme), person at 390 px (light scheme). Every leg OBSERVES and logs (body excerpts, testids
// present) before it asserts; a leg that fails logs `leg_failed` + a screenshot and the walk CONTINUES to the next leg.
// No SQL fabricates state — every write goes through the real UI (onboarding wizard, company setup form, chat forms).
//
//  L0  health + two users created via admin.auth.admin.createUser (ids logged for the residue register; never deleted —
//      pilot_events FK blocks user deletes). Password random, never printed.
//  L1  ORG: /lt → "Reikia 2 pastolininkų Vilniuje" → [entry-understanding] → LOGIN door (?next=/dashboard?say=…) →
//      the door with a live cookie → onboarding wizard (intent `hire`, lib/onboarding/first-run-intent.ts) → returnTo
//      wins (components/app/onboarding-wizard.tsx: `if (returnTo) form.set("next", returnTo)`) → /lt/dashboard?say=… →
//      the sentence is the first own turn → [inline-action-form-company.create-demand] (need-workers intent) →
//      company setup in a 2nd tab (/dashboard/start/company — the shell row from complete_onboarding is EDITED, never a
//      2nd company) → A4 hub /dashboard/start → the demand form submitted → readback customer_requests.
//  L2  PERSON: /lt → "Ieškau darbo Vilniuje" (find-work) → SIGNUP door → wizard (`work`, profession) → /lt/dashboard?say=
//      → [opportunities-view] rows or the honest empty answer → A4: /dashboard/start + /dashboard/profile hub.
//  L3  ORG → PERSON: "parodyk kandidatus" (candidates intent → startEmployerCandidates → [candidates-view]) → contact /
//      booking ONLY when the card offers it ([candidate-contact-*] / [candidate-book-open-*]); the roster invitation by
//      sentence "pakviesk darbuotoją … į komandą" (invite-candidate → company.invite-worker form) → fallback: the
//      network page invite panel. PERSON: brief "kviečia jus" → "mano kvietimai" → accept → confirm → done(outcome).
//      Reply to the contact thread when one exists ("mano žinutės" → chat-reply-*). ORG: sees the roster ("kas laisvas?").
//  L4  ORG: "sukurk projektą E2E Spine objektas" → company.create-project form → the panel → [project-assign-worker] →
//      the person chip → "Priskirta projektui." → "kas trūksta projektui …?" → "Pradėti dokumentų sąrašą" →
//      "Paprašyti: <person>" → PERSON: brief "Laukia nurodymų" + /lt/dashboard/instructions ledger.
//  L6  residue register: every row the walk created + the exact SQL to inspect / delete (via MCP afterwards).
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-full-spine"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12); // yyyymmddHHMM (UTC)
const ORG_EMAIL = `e2e-spine-org-${STAMP}@labourmarket.ai`;
const PERSON_EMAIL = `e2e-spine-person-${STAMP}@labourmarket.ai`;
const ORG_SENTENCE = "Reikia 2 pastolininkų Vilniuje"; // intent need-workers (intent-router.ts, V9 rule: SEEK VERB `reikia` + occupation stem; walk-landing.log proved "Reikia 12 pastolininkų Roterdame" → need-workers on prod)
const PERSON_SENTENCE = "Ieškau darbo Vilniuje"; // intent find-work (intent-router.ts `\bieškau\b`)
const ORG_NAME = "E2E Spine UAB (testinis)";
const ORG_OWNER_NAME = "E2E Spine Savininkas";
const PERSON_NAME = "E2E Spine Žmogus";
const PROJECT = "E2E Spine objektas";
// No `scaffolder` slug exists in lib/taxonomy/profession-skills.ts (PROFESSION_SLUGS); `builder` carries the
// `scaffolding` skill and is the closest canonical profession. Logged as a GAP in the profession step.
const PROFESSION_SLUG = "builder";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build, stamp: STAMP });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const startedAt = new Date().toISOString();

  // ── L0 — two fresh bounded identities (never printed: the password) ──────────────────────────────────────────────
  const createUser = async (email) => {
    const password = crypto.randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw new Error("createUser failed for " + email + ": " + error.message);
    return data.user.id;
  };
  const orgId = await createUser(ORG_EMAIL);
  const personId = await createUser(PERSON_EMAIL);
  log({ step: "L0_identities", org: { email: ORG_EMAIL, id: orgId }, person: { email: PERSON_EMAIL, id: personId }, note: "auth.users rows are KEPT (pilot_events FK); register them in the residue register" });

  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();
  const ORG_VIEW = { width: 1280, height: 900 }, PERSON_VIEW = { width: 390, height: 844 };
  const contextFor = async (email, viewport, colorScheme) => {
    const c = await b.newContext({ viewport, locale: "lt-LT", colorScheme });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    return c;
  };
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  const body = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  /** What is on the page — the testids present (deduplicated, bounded) + a body excerpt. Observation, not assertion. */
  const observe = async (p, label, excerptFrom) => {
    const ids = await p.locator("[data-testid]").evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("data-testid")))).slice(0, 80)).catch(() => []);
    const text = await body(p).catch(() => "");
    const at = excerptFrom ? Math.max(0, text.indexOf(excerptFrom) - 80) : 0;
    log({ step: label, ms: ms(), url: p.url(), testids: ids, excerpt: text.slice(at, at + 700) });
    return { ids, text };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  /** Sends a sentence and returns the text of assistant content that appeared AFTER it (never the user's own echo). */
  const ask = async (p, sentence, maxMs = 45000) => {
    const thread = p.getByTestId("conversation-thread");
    const before = (await thread.innerText()).length;
    const resultsBefore = await p.getByTestId("msg-result").count();
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    const t = Date.now(); let text = "";
    while (Date.now() - t < maxMs) {
      await p.waitForTimeout(1500);
      const typing = await p.getByTestId("chat-typing").count();
      const full = await thread.innerText();
      const grew = full.length > before + sentence.length + 20;
      if (!typing && (grew || (await p.getByTestId("msg-result").count()) > resultsBefore)) { text = full.slice(full.lastIndexOf(sentence) + sentence.length); break; }
    }
    return text.replace(/\s+/g, " ").trim();
  };
  const clickButton = async (p, re, waitMs) => { const btn = p.getByRole("button", { name: re }).last(); if ((await btn.count()) === 0) return false; await btn.scrollIntoViewIfNeeded().catch(() => {}); await btn.click(); await p.waitForTimeout(waitMs); return true; };
  /** One leg: failure is logged (message + screenshot + page dump) and the walk continues. */
  const leg = async (name, p, fn) => { try { await fn(); } catch (e) { log({ step: "leg_failed", leg: name, ms: ms(), error: e && e.message ? e.message.slice(0, 400) : String(e) }); if (p) { await shot(p, "99-failed-" + name); await observe(p, "leg_failed_dump_" + name).catch(() => {}); } } };
  /** The public entry on /lt: type the sentence, return the understanding + the two door hrefs. */
  const publicEntry = async (viewport, sentence, tag) => {
    const a = await (await b.newContext({ viewport, locale: "lt-LT" })).newPage();
    await a.goto(HOST + "/lt", { waitUntil: "domcontentloaded", timeout: 60000 });
    await a.getByTestId("entry-input").waitFor({ timeout: 60000 });
    await a.getByTestId("entry-input").fill(sentence);
    await a.getByTestId("entry-submit").click();
    const u = a.getByTestId("entry-understanding");
    const understood = await u.waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    const question = (await a.getByTestId("entry-question").count()) > 0;
    const doors = understood ? { signup: await a.getByTestId("entry-signup").locator("a").getAttribute("href"), login: await a.getByTestId("entry-login").locator("a").getAttribute("href") } : null;
    log({ step: tag, sentence, understood, intent: understood ? await u.getAttribute("data-intent") : null, understoodText: understood ? (await u.innerText()).replace(/\s+/g, " ").slice(0, 220) : null, askedQuestion: question, doors });
    await shot(a, tag);
    await a.context().close();
    return doors;
  };
  /** Through a door with a live cookie. Real behaviour observed: the LoginForm is a client form (no auto-forward), the
   *  dashboard layout redirects a not-onboarded profile to /onboarding WITHOUT `next` (app/[locale]/dashboard/layout.tsx:116);
   *  only the auth callback forwards `?next=` to onboarding. When the door does not preserve it, the walk re-attaches the
   *  door's own `next` to /lt/onboarding — the same value the callback would carry — and says so. */
  const throughDoor = async (p, doorHref, tag) => {
    const href = doorHref.startsWith("http") ? doorHref : HOST + doorHref;
    const next = new URL(href).searchParams.get("next");
    await p.goto(href, { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.waitForTimeout(4000);
    const afterDoor = p.url();
    let onOnboarding = /\/onboarding/.test(afterDoor);
    let carriedNext = onOnboarding && /next=/.test(afterDoor);
    if (!onOnboarding) {
      // the dashboard root — its layout forwards a not-onboarded profile to /onboarding
      await p.goto(HOST + "/lt" + (next || "/dashboard"), { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(4000);
      onOnboarding = /\/onboarding/.test(p.url());
      carriedNext = onOnboarding && /next=/.test(p.url());
    }
    let nextReattached = false;
    if (onOnboarding && !carriedNext && next) {
      nextReattached = true;
      await p.goto(HOST + "/lt/onboarding?next=" + encodeURIComponent(next), { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    log({ step: tag, doorHref: href, afterDoor, onOnboarding, carriedNext, nextReattached, url: p.url(), next });
    return next;
  };
  /** The onboarding wizard (components/app/onboarding-wizard.tsx): intent card → continue → name, country, profession. */
  const onboard = async (p, intent, displayName, professionSlug, tag) => {
    await p.getByTestId(`onboarding-intent-${intent}`).waitFor({ timeout: 60000 });
    await p.getByTestId(`onboarding-intent-${intent}`).click();
    await p.getByTestId("onboarding-intents-continue").click();
    await p.locator('input[name="display_name"]').waitFor({ timeout: 30000 });
    await p.locator('input[name="display_name"]').fill(displayName);
    await p.locator('select[name="country"]').selectOption("LT");
    let profession = null;
    const prof = p.getByTestId("onboarding-profession");
    if (professionSlug && (await prof.count()) > 0) {
      const values = await prof.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
      const scaffolderLike = values.filter((v) => /scaffold|pastolin/i.test(v));
      const chosen = values.includes(professionSlug) ? professionSlug : values[0];
      await prof.selectOption(chosen);
      profession = { chosen, scaffolderSlugExists: scaffolderLike.length > 0, scaffolderLike, optionCount: values.length, gap: scaffolderLike.length === 0 ? "no scaffolder/pastolininkas profession slug in PROFESSION_SLUGS — `builder` (carries the `scaffolding` skill) used instead" : null };
    }
    await shot(p, tag + "-step2");
    await p.locator('form button[type="submit"]').first().click();
    // a successful onboarding ends in a server redirect (completeOnboarding → next or ROLE_DASHBOARD)
    for (let i = 0; i < 40; i++) { await p.waitForTimeout(1500); if (!/\/onboarding/.test(p.url())) break; }
    const err = await p.locator('[role="alert"]').first().innerText().catch(() => null);
    log({ step: tag, ms: ms(), intent, displayName, profession, landed: p.url(), leftOnboarding: !/\/onboarding/.test(p.url()), alert: err });
    await shot(p, tag + "-landed");
  };
  /** Fill + submit the ONE inline form; returns done/error. Field testids: `field-<name>` (inline-action-form.tsx). */
  const submitInlineForm = async (p, actionId, fields, tag) => {
    const form = p.getByTestId(`inline-action-form-${actionId}`).last();
    const appeared = await form.waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (!appeared) { log({ step: tag, formAppeared: false }); return { appeared: false }; }
    const prefilled = {};
    for (const [name, value] of Object.entries(fields)) {
      const el = form.getByTestId(`field-${name}`).first();
      if ((await el.count()) === 0) { prefilled[name] = "(no field)"; continue; }
      prefilled[name] = await el.inputValue().catch(() => null);
      if (value !== undefined && value !== null) await el.fill(String(value));
    }
    await shot(p, tag + "-form");
    await p.getByTestId("inline-action-continue").last().click();
    await p.getByTestId("inline-action-review").last().waitFor({ timeout: 30000 });
    await shot(p, tag + "-review");
    await p.getByTestId("inline-action-save").last().click();
    let done = false, error = null;
    for (let i = 0; i < 30; i++) { await p.waitForTimeout(2000); done = (await p.getByTestId("inline-action-done").count()) > 0; error = await p.getByTestId("inline-action-error").last().innerText().catch(() => null); if (done || error) break; }
    log({ step: tag, ms: ms(), formAppeared: true, prefilled, filled: fields, saved: done && !error, error });
    await shot(p, tag + "-saved");
    return { appeared: true, saved: done && !error, error };
  };

  // ═══ L1 — ORG ═════════════════════════════════════════════════════════════════════════════════════════════════════
  const orgDoors = await publicEntry(ORG_VIEW, ORG_SENTENCE, "L1_org_public_entry");
  const oc = await contextFor(ORG_EMAIL, ORG_VIEW, "dark");
  const o = await oc.newPage();
  let orgNext = "/dashboard?say=" + encodeURIComponent(ORG_SENTENCE);
  await leg("L1_org_door_onboarding", o, async () => {
    orgNext = (await throughDoor(o, (orgDoors && orgDoors.login) || `/lt/auth/login?next=${encodeURIComponent(orgNext)}`, "L1_org_door")) || orgNext;
    await onboard(o, "hire", ORG_OWNER_NAME, null, "L1_org_onboarding");
  });
  let orgFirstTurn = null;
  await leg("L1_org_chat_lands_with_sentence", o, async () => {
    if (!/\/dashboard/.test(o.url())) await o.goto(HOST + "/lt" + orgNext, { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    let text = "";
    for (let i = 0; i < 24; i++) {
      await o.waitForTimeout(1500);
      const users = o.getByTestId("msg-user");
      if ((await users.count()) > 0) orgFirstTurn = (await users.first().innerText()).trim();
      text = await body(o);
      if ((await o.getByTestId("inline-action-form-company.create-demand").count()) > 0) break;
    }
    const obs = await observe(o, "L1_org_chat_observed", ORG_SENTENCE);
    log({ step: "L1_org_chat", ms: ms(), url: o.url(), sayStripped: !/say=/.test(o.url()), firstUserTurn: orgFirstTurn, firstTurnIsSentence: orgFirstTurn === ORG_SENTENCE, demandFormOpen: obs.ids.includes("inline-action-form-company.create-demand"), greeting: (obs.text.match(/[^.]*(Labas|Sveiki)[^.]*\./) || [null])[0] });
    await shot(o, "L1-org-chat");
  });
  // company identity in a second tab — the shell row is completed, the chat tab keeps its form
  const o2 = await oc.newPage();
  await leg("L1_org_company_setup", o2, async () => {
    await o2.goto(HOST + "/lt/dashboard/start/company", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o2.getByTestId("company-setup-form").waitFor({ timeout: 60000 });
    const title = await o2.locator("h1, h2").first().innerText().catch(() => null);
    await o2.getByTestId("company-setup-legal-name").fill(ORG_NAME);
    const typeOpt = o2.getByTestId("company-setup-company-type-construction");
    if ((await typeOpt.count()) > 0) await typeOpt.click();
    await o2.getByTestId("company-setup-country").selectOption("LT");
    await shot(o2, "L1-org-company-form");
    await o2.getByTestId("company-setup-save-draft").click();
    await o2.getByTestId("company-setup-result").waitFor({ timeout: 60000 });
    const result = await o2.getByTestId("company-setup-result").innerText();
    log({ step: "L1_org_company_setup", ms: ms(), formTitle: title, result, nextDoor: (await o2.getByTestId("company-setup-go-workspace").count()) > 0 });
    await shot(o2, "L1-org-company-saved");
  });
  await leg("L1_org_A4_start_hub", o2, async () => {
    await o2.goto(HOST + "/lt/dashboard/start", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o2.getByTestId("activity-setup-hub").waitFor({ timeout: 60000 });
    const lane = await o2.getByTestId("activity-setup-lane-company").innerText();
    log({ step: "A4_org_start_hub", ms: ms(), companyLane: lane.replace(/\s+/g, " ").slice(0, 300), companyStarted: /Pradėta/.test(lane), companyNamed: lane.includes(ORG_NAME), startLinkStillOffered: (await o2.getByTestId("activity-setup-lane-company-start").count()) > 0, nextStepNamed: /Atidaryti įmonės nustatymą|Eiti į įmonės dashboardą|Pradėti įmonės nustatymą/.test(lane) });
    await shot(o2, "L1-org-A4-start-hub");
  });
  await leg("L1_org_need_submitted", o, async () => {
    if ((await o.getByTestId("inline-action-form-company.create-demand").count()) === 0) {
      // the sentence did not open the form on landing (observed above) — send it again in the conversation
      const answer = await ask(o, ORG_SENTENCE);
      log({ step: "L1_org_need_resent", answerExcerpt: answer.slice(0, 300) });
    }
    const r = await submitInlineForm(o, "company.create-demand", { role: "Pastolininkas", location: "Vilnius, Lietuva", teamSize: 2 }, "L1_org_need");
    if (r.saved) { await o.waitForTimeout(3000); await observe(o, "L1_org_need_after_save", "Pastolinink"); }
    const { data: rows, error } = await admin.from("customer_requests").select("id, title, status, organization_id, created_at").gte("created_at", startedAt).order("created_at", { ascending: false }).limit(5);
    log({ step: "L1_org_need_readback", error: error ? error.message : null, rows: (rows || []).map((x) => ({ id: x.id, title: x.title, status: x.status, organization_id: x.organization_id })) });
  });

  // ═══ L2 — PERSON ══════════════════════════════════════════════════════════════════════════════════════════════════
  const personDoors = await publicEntry(PERSON_VIEW, PERSON_SENTENCE, "L2_person_public_entry");
  const wc = await contextFor(PERSON_EMAIL, PERSON_VIEW, "light");
  const w = await wc.newPage();
  let personNext = "/dashboard?say=" + encodeURIComponent(PERSON_SENTENCE);
  await leg("L2_person_door_onboarding", w, async () => {
    personNext = (await throughDoor(w, (personDoors && personDoors.signup) || `/lt/auth/signup?next=${encodeURIComponent(personNext)}`, "L2_person_door")) || personNext;
    await onboard(w, "work", PERSON_NAME, PROFESSION_SLUG, "L2_person_onboarding");
  });
  await leg("L2_person_first_answer", w, async () => {
    if (!/\/dashboard/.test(w.url())) await w.goto(HOST + "/lt" + personNext, { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
    let firstTurn = null;
    for (let i = 0; i < 30; i++) {
      await w.waitForTimeout(1500);
      const users = w.getByTestId("msg-user");
      if ((await users.count()) > 0) firstTurn = (await users.first().innerText()).trim();
      if ((await w.getByTestId("opportunities-view").count()) > 0 && (await w.getByTestId("opportunities-loading").count()) === 0) break;
      if (firstTurn && (await w.getByTestId("chat-typing").count()) === 0 && i > 8) break;
    }
    const obs = await observe(w, "L2_person_chat_observed", PERSON_SENTENCE);
    const rows = await w.locator('[data-testid^="opportunities-row-"]').count();
    log({ step: "L2_person_first_answer", ms: ms(), url: w.url(), sayStripped: !/say=/.test(w.url()), firstUserTurn: firstTurn, firstTurnIsSentence: firstTurn === PERSON_SENTENCE, opportunitiesView: obs.ids.includes("opportunities-view"), rows, partial: obs.ids.includes("opportunities-partial"), error: obs.ids.includes("opportunities-error"), externalRows: await w.getByTestId("opportunities-external-row").count(), orgNeedVisible: /pastolinink/i.test(obs.text) && obs.text.includes("Vilni"), honestNone: /nerasta|nėra|kol kas|dar ne/i.test(obs.text) });
    await shot(w, "L2-person-first-answer");
  });
  await leg("L2_person_A4", w, async () => {
    const v = await wc.newPage();
    await v.goto(HOST + "/lt/dashboard/start", { waitUntil: "domcontentloaded", timeout: 60000 });
    const hub = await v.getByTestId("activity-setup-hub").waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
    const hubText = hub ? (await v.getByTestId("activity-setup-hub").innerText()).replace(/\s+/g, " ").slice(0, 400) : null;
    await shot(v, "L2-person-A4-start-hub");
    await v.goto(HOST + "/lt/dashboard/profile", { waitUntil: "domcontentloaded", timeout: 60000 });
    const hubReady = await v.getByTestId("profile-hub-overview").waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
    const primary = hubReady ? await v.getByTestId("profile-hub-primary-action").innerText().catch(() => null) : null;
    const missing = hubReady ? await v.getByTestId("profile-hub-missing").innerText().catch(() => null) : null;
    log({ step: "A4_person_start", ms: ms(), startHub: hub, startHubExcerpt: hubText, profileHub: hubReady, primaryAction: primary ? primary.replace(/\s+/g, " ").slice(0, 200) : null, missing: missing ? missing.replace(/\s+/g, " ").slice(0, 300) : null, nextStepNamed: Boolean(primary && primary.trim().length > 0) });
    await shot(v, "L2-person-A4-profile-hub");
    await v.close();
  });

  // ═══ L3 — ORG → PERSON ═══════════════════════════════════════════════════════════════════════════════════════════
  let contacted = false, invited = false, inviteVia = null;
  await leg("L3_org_candidates", o, async () => {
    await o.reload({ waitUntil: "domcontentloaded" });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await o.waitForTimeout(5000);
    const answer = await ask(o, "parodyk kandidatus", 60000);
    for (let i = 0; i < 10; i++) { if ((await o.getByTestId("candidates-view").count()) > 0 || /neaprašė poreikio/.test(await body(o))) break; await o.waitForTimeout(2000); }
    const obs = await observe(o, "L3_org_candidates_observed", "Kandidat");
    const cards = await o.locator('[data-testid^="candidate-"]:not([data-testid^="candidate-booking"]):not([data-testid^="candidates-"])').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).filter((id) => /^candidate-[0-9a-f-]{36}$/.test(id || "")));
    const contactBtns = await o.locator('[data-testid^="candidate-contact-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    const bookBtns = await o.locator('[data-testid^="candidate-book-open-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    log({ step: "L3_org_candidates", ms: ms(), answerExcerpt: answer.slice(0, 260), noDemands: /neaprašė poreikio/.test(obs.text), candidatesView: obs.ids.includes("candidates-view"), empty: obs.ids.includes("candidates-empty"), notStructured: obs.ids.includes("candidates-not-structured"), cards, personOnCards: obs.text.includes(PERSON_NAME), contactBtns, bookBtns, cannotContact: await o.getByTestId("candidate-cannot-contact").count(), notEligible: await o.getByTestId("candidate-not-eligible").count() });
    await shot(o, "L3-org-candidates");
    // contact ONLY when the card offers it (owner rule 6 — the control is not rendered otherwise)
    const personCard = o.locator('[data-testid^="candidate-"]').filter({ hasText: PERSON_NAME }).first();
    const contactBtn = ((await personCard.count()) > 0 ? personCard : o).locator('[data-testid^="candidate-contact-"]').first();
    if ((await contactBtn.count()) > 0) {
      const id = await contactBtn.getAttribute("data-testid");
      await contactBtn.click();
      await o.waitForTimeout(8000);
      const err = await o.getByTestId(id + "-error").innerText().catch(() => null);
      contacted = !err;
      log({ step: "L3_org_contact", button: id, error: err, tail: (await body(o)).slice(-300) });
      await shot(o, "L3-org-contacted");
    }
  });
  await leg("L3_org_invitation", o, async () => {
    // the roster invitation by sentence (invite-candidate → company.invite-worker → invite_company_worker)
    const answer = await ask(o, `pakviesk darbuotoją ${PERSON_EMAIL} į komandą`, 30000);
    log({ step: "L3_org_invite_sentence", answerExcerpt: answer.slice(0, 260) });
    const r = await submitInlineForm(o, "company.invite-worker", { email: PERSON_EMAIL, note: "E2E Spine kvietimas (testinis)" }, "L3_org_invite_form");
    if (r.appeared && r.saved) { invited = true; inviteVia = "chat:company.invite-worker"; }
    else {
      // fallback — the network page invite panel (canonical `join_organization` invitation), as in walk-invitation-prod.cjs
      const n = await oc.newPage();
      await n.goto(HOST + "/lt/dashboard/network", { waitUntil: "domcontentloaded", timeout: 60000 });
      await n.waitForTimeout(6000);
      const openBtn = n.getByTestId("invite-panel-open");
      if ((await openBtn.count()) > 0) {
        await openBtn.click(); await n.waitForTimeout(2000);
        await n.getByTestId("invite-type").selectOption("join_organization").catch(() => {}); await n.waitForTimeout(800);
        const orgSel = n.getByTestId("invite-organization");
        if ((await orgSel.count()) > 0) {
          const labels = await orgSel.locator("option").allInnerTexts();
          await orgSel.selectOption({ label: ORG_NAME }).catch(async () => { const first = await orgSel.locator("option").nth(labels[0] === "" ? 1 : 0).getAttribute("value"); if (first) await orgSel.selectOption(first); });
          log({ step: "L3_org_invite_org_options", labels });
        }
        const capSel = n.getByTestId("invite-capacity");
        if ((await capSel.count()) > 0) await capSel.selectOption("employee").catch(() => {});
        await n.getByTestId("invite-emails").fill(PERSON_EMAIL);
        await n.getByTestId("invite-submit").click();
        for (let i = 0; i < 20; i++) { await n.waitForTimeout(1500); if ((await n.locator('[data-testid^="invite-result-"]').count()) > 0) break; }
        const outcomes = await n.locator('[data-testid^="invite-result-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
        invited = outcomes.some((x) => /created|sent/.test(x || ""));
        if (invited) inviteVia = "network:join_organization";
        log({ step: "L3_org_invite_network", outcomes, invited });
        await shot(n, "L3-org-invite-network");
      } else {
        await observe(n, "L3_org_invite_network_unreachable");
      }
      await n.close();
    }
    log({ step: "L3_org_invited", invited, inviteVia });
  });
  let personConversation = null, acceptedOutcome = null;
  await leg("L3_person_attention_accept", w, async () => {
    await w.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await w.waitForTimeout(9000); // the brief is pushed asynchronously after mount
    const brief = await body(w);
    log({ step: "L3_person_brief", ms: ms(), inviteLine: (brief.match(/[^.]*kviečia jus[^.]*\./) || [null])[0], inviterNamed: brief.includes(ORG_NAME), unreadLine: (brief.match(/[^.]*neperskaityt[^.]*\./) || [null])[0], offersLine: (brief.match(/Rezervacijų pasiūlymai[^.]*\./) || [null])[0], chips: await w.locator('[data-testid^="chat-chip-"]').allInnerTexts() });
    await shot(w, "L3-person-brief");
    const list = await ask(w, "mano kvietimai", 30000);
    log({ step: "L3_person_invitations_list", line: (list.match(/Jums adresuoti kvietimai[^.]*\.|[^.]*kvietimų nėra[^.]*\./) || [null])[0], cards: await w.getByTestId("conversation-invitation-action").count() });
    await shot(w, "L3-person-invitations");
    const accept = w.getByTestId("conversation-invitation-accept").first();
    if ((await accept.count()) > 0) {
      await accept.click(); await w.waitForTimeout(2500);
      await w.getByTestId("conversation-invitation-confirm").first().click();
      await w.getByTestId("conversation-invitation-done").first().waitFor({ timeout: 40000 });
      acceptedOutcome = await w.getByTestId("conversation-invitation-done").first().getAttribute("data-outcome");
      log({ step: "L3_person_accepted", ms: ms(), outcome: acceptedOutcome, error: await w.getByTestId("conversation-invitation-error").first().innerText().catch(() => null) });
      await shot(w, "L3-person-accepted");
    } else {
      await observe(w, "L3_person_no_accept_button", "kvietim");
    }
    if (contacted) {
      const msgs = await ask(w, "mano žinutės", 30000);
      const input = w.locator('[data-testid^="chat-reply-input-"]').last();
      log({ step: "L3_person_messages", excerpt: msgs.slice(0, 260), replyOffered: (await input.count()) > 0 });
      if ((await input.count()) > 0) {
        personConversation = (await input.getAttribute("data-testid")).replace("chat-reply-input-", "");
        await input.fill("Taip, galiu pradėti nuo kito pirmadienio.");
        await w.getByTestId(`chat-reply-review-${personConversation}`).click();
        await w.getByTestId(`chat-reply-confirm-${personConversation}`).waitFor({ timeout: 20000 });
        await w.getByTestId(`chat-reply-confirm-${personConversation}`).click();
        await w.getByTestId(`chat-reply-sent-${personConversation}`).waitFor({ timeout: 30000 });
        log({ step: "L3_person_replied", conversationId: personConversation });
        await shot(w, "L3-person-replied");
      }
    }
  });
  await leg("L3_org_sees_response", o, async () => {
    await o.reload({ waitUntil: "domcontentloaded" });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await o.waitForTimeout(9000);
    const brief = await body(o);
    const roster = await ask(o, "kas laisvas?", 45000);
    let msgs = null;
    if (personConversation) msgs = await ask(o, "mano žinutės", 30000);
    log({ step: "L3_org_sees_response", ms: ms(), briefExcerpt: brief.slice(0, 400), personOnRoster: roster.includes(PERSON_NAME), rosterExcerpt: roster.slice(0, 300), replyVisible: msgs ? /pirmadienio/.test(msgs) : null, messagesExcerpt: msgs ? msgs.slice(0, 300) : null });
    await shot(o, "L3-org-sees-response");
  });

  // ═══ L4 — PROJECT · ASSIGNMENT · READINESS / GAP ═════════════════════════════════════════════════════════════════
  let projectSaved = false, assigned = null;
  await leg("L4_org_project", o, async () => {
    const answer = await ask(o, `sukurk projektą ${PROJECT}`, 30000);
    log({ step: "L4_org_project_sentence", answerExcerpt: answer.slice(0, 200), intro: /Naujas projektas/.test(answer) });
    const r = await submitInlineForm(o, "company.create-project", { title: PROJECT, city: "Vilnius" }, "L4_org_project_form");
    projectSaved = Boolean(r.saved);
    await o.waitForTimeout(6000);
    let detail = (await o.getByTestId("project-detail").count()) > 0;
    if (!detail) {
      await ask(o, "mano projektai", 30000);
      const row = o.locator('[data-testid^="project-row-"]').filter({ hasText: PROJECT }).first();
      if ((await row.count()) > 0) { await row.click({ force: true }); await o.waitForTimeout(6000); }
      detail = (await o.getByTestId("project-detail").count()) > 0;
    }
    const assign = o.getByTestId("project-assign-worker").first();
    log({ step: "L4_org_project_panel", ms: ms(), detail, assignControl: (await assign.count()) > 0, noAssign: (await o.getByTestId("project-no-assign").count()) > 0, rows: await o.locator('[data-testid^="project-row-"]').count() });
    await shot(o, "L4-org-project-panel");
    if ((await assign.count()) > 0) {
      await assign.click(); await o.waitForTimeout(6000);
      const pick = await body(o);
      const chip = o.getByRole("button", { name: new RegExp(esc(PERSON_NAME)) }).last();
      log({ step: "L4_org_pick", asked: /Kas turėtų jame dirbti/.test(pick), none: /nėra ko priskirti/.test(pick), personChip: await chip.count(), buttons: (await o.getByRole("button").allInnerTexts()).filter((s) => /E2E/.test(s)).slice(0, 6) });
      if ((await chip.count()) > 0) {
        await chip.scrollIntoViewIfNeeded().catch(() => {}); await chip.click({ timeout: 15000 }); await o.waitForTimeout(15000);
        const done = await body(o);
        assigned = /Priskirta projektui/.test(done) ? "assigned" : /Priskyrimo atlikti nepavyko/.test(done) ? "failed" : "unknown";
        log({ step: "L4_org_assigned", ms: ms(), assigned, tail: done.slice(-400) });
        await shot(o, "L4-org-assigned");
      }
    }
  });
  let askedInstruction = false;
  await leg("L4_org_readiness_gap", o, async () => {
    let t = await ask(o, `kas trūksta projektui ${PROJECT}?`, 60000);
    if (await clickButton(o, /^Pradėti dokumentų sąrašą/, 12000)) t = await body(o);
    const personLine = (t.match(new RegExp("• " + esc(PERSON_NAME) + "[^•]{0,200}")) || [null])[0];
    const askChip = o.getByRole("button", { name: new RegExp("^Paprašyti: " + esc(PERSON_NAME)) });
    log({ step: "L4_org_gap", ms: ms(), excerpt: t.slice(0, 500), personLine, askChip: (await askChip.count()) > 0, chips: (await o.getByRole("button").allInnerTexts()).filter((s) => /^(Paprašyti|Pradėti|Gauta|Patikrinta)/.test(s)).slice(0, 8) });
    await shot(o, "L4-org-gap");
    if ((await askChip.count()) > 0) {
      await askChip.last().click(); await o.waitForTimeout(12000);
      const after = await body(o);
      askedInstruction = /Nurodymas išsiųstas/.test(after);
      log({ step: "L4_org_instruction", sent: askedInstruction, said: (after.match(/Nurodymas išsiųstas[^.]*\./) || [null])[0] });
      await shot(o, "L4-org-instruction");
    }
  });
  await leg("L4_person_instructions", w, async () => {
    await w.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await w.waitForTimeout(9000);
    const brief = await body(w);
    log({ step: "L4_person_brief", ms: ms(), instructionsLine: (brief.match(/Laukia nurodymų[^.]*\./) || [null])[0], projectNamed: brief.includes(PROJECT), excerpt: brief.slice(0, 400) });
    await shot(w, "L4-person-brief");
    const projects = await ask(w, "mano projektai", 30000);
    log({ step: "L4_person_projects_chat", excerpt: projects.slice(0, 300), askLine: (projects.match(/Vadovas laukia:[^.]*\./) || [null])[0], projectNamed: projects.includes(PROJECT) });
    await w.goto(HOST + "/lt/dashboard/instructions", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.waitForTimeout(6000);
    const obs = await observe(w, "L4_person_instructions_page", "nurodym");
    log({ step: "L4_person_instructions", ms: ms(), cards: await w.getByTestId("worker-instruction-card").count(), asks: (await w.getByTestId("instruction-project-ask").allInnerTexts()).slice(0, 8), empty: obs.ids.includes("instructions-empty"), projectNamed: obs.text.includes(PROJECT) });
    await shot(w, "L4-person-instructions");
  });

  await b.close();
  // ═══ L6 — RESIDUE REGISTER (inspect via MCP; delete only what the walk created — auth.users/profiles are KEPT) ══════
  const residue = {
    identities: { org: { email: ORG_EMAIL, profile_id: orgId }, person: { email: PERSON_EMAIL, profile_id: personId }, keep: true },
    created: { company: ORG_NAME, need: ORG_SENTENCE + " (customer_requests, since " + startedAt + ")", project: projectSaved ? PROJECT : null, assignment: assigned, invitation: invited ? inviteVia : null, invitationAccepted: acceptedOutcome, contactConversation: contacted, personReplyConversation: personConversation, instruction: askedInstruction },
    inspect: [
      `select id, email, created_at from auth.users where id in ('${orgId}','${personId}')`,
      `select id, full_name, active_role, onboarded_at from profiles where id in ('${orgId}','${personId}')`,
      `select profile_id, role from profile_roles where profile_id in ('${orgId}','${personId}')`,
      `select * from worker_professions where profile_id = '${personId}'`,
      `select id, legal_name, display_name, company_type, verification_status, profile_id from companies where profile_id = '${orgId}'`,
      `select id, title, status, organization_id, created_at from customer_requests where organization_id in (select id from companies where profile_id = '${orgId}') or created_at >= '${startedAt}' order by created_at desc limit 10`,
      `select id, title, city, company_id, status, created_at from projects where title = '${PROJECT}'`,
      `select * from project_worker_assignments where project_id in (select id from projects where title = '${PROJECT}')`,
      `select id, company_id, invited_email, status, created_at from company_worker_invitations where lower(invited_email) = '${PERSON_EMAIL}'`,
      `select id, status, invited_email, invitation_type, created_at from invitations where lower(invited_email) = '${PERSON_EMAIL}'`,
      `select id, relationship_slug, status, created_at from engagement_contexts where profile_id = '${personId}'`,
      `select company_id, worker_id, status from company_workers where worker_id in (select id from workers where profile_id = '${personId}')`,
      `select id, request_id, status, created_at from booking_requests where worker_id in (select id from workers where profile_id = '${personId}') order by created_at desc limit 5`,
      `select id, conversation_id, author_id, is_instruction, left(body,60) body, created_at from conversation_messages where author_id in ('${orgId}','${personId}') or project_id in (select id from projects where title = '${PROJECT}') order by created_at desc limit 10`,
      `select event_name, count(*) from pilot_events where profile_id in ('${orgId}','${personId}') group by 1 order by 2 desc`,
    ],
    deleteOrder: "conversation_messages → conversations → project_worker_assignments → projects → booking_requests → company_worker_invitations / invitations → engagement_contexts / company_workers → customer_requests → companies; KEEP auth.users + profiles (+ pilot_events) — register the two identities as E2E residue",
  };
  log({ step: "residue", ...residue });
  log({ step: "done", totalMs: ms(), readback: residue.inspect.join("; ") });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
