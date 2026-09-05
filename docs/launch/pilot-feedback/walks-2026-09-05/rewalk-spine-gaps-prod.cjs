/**
 * rewalk-spine-gaps-prod.cjs — re-walk ONLY the legs the 2026-09-05 15:08 full-spine walk recorded as gaps,
 * on the served build, with the KEPT spine identities (no new auth users are minted).
 *
 * Gap legs (walk-full-spine.log on 613f6a4c):
 *   G1 L1_org_company_setup — the walk clicked the sr-only radio input; a real user clicks its LABEL. Company stays UNNAMED.
 *   G2 L4_org_project_panel — "Projektas: Šis rezultatas nepasiekiamas dabartiniame kontekste" (D-S3 class, fixed #1543) → no assign.
 *   G3 L4_org_gap / L4_org_instruction — depended on G2 (no person on the project → no ask chip).
 *   G4 L4_person_instructions — depended on G3.
 *
 * Usage (PowerShell):  $env:EXPECT_BUILD="<sha7>"; node rewalk-spine-gaps-prod.cjs | Tee-Object rewalk-spine-gaps.log
 * Residue: the company gets its name (kept — it is the identity's own row); a project assignment + one instruction
 * message may be created (inspect SQL in the `residue` line; delete only those, never the auth users/profiles).
 */
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "rewalk-spine-gaps"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
const ORG_EMAIL = "e2e-spine-org-202609051508@labourmarket.ai";
const PERSON_EMAIL = "e2e-spine-person-202609051508@labourmarket.ai";
const ORG_ID = "03e1861f-7dda-4372-9e90-e4eac7928772";
const PERSON_ID = "70851a66-168c-443c-bb7b-d6f4d5112cd6";
const ORG_NAME = "E2E Spine UAB (testinis)";
const PERSON_NAME = "E2E Spine Žmogus";
const PROJECT = "E2E Spine objektas";
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!/gorgitwvdzxbnaxhrsrw/.test(url)) throw new Error("host");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const startedAt = new Date().toISOString();
  const session = async (email) => {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }); if (error) throw error;
    const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: sess, error: v } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" }); if (v) throw v;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  const b = await chromium.launch();
  const contextFor = async (email, viewport, colorScheme) => {
    const c = await b.newContext({ viewport, locale: "lt-LT", colorScheme });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    return c;
  };
  const t0 = Date.now(); const ms = () => Date.now() - t0;
  const body = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const observe = async (p, label, excerptFrom) => {
    const ids = await p.locator("[data-testid]").evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("data-testid")))).slice(0, 80)).catch(() => []);
    const text = await body(p).catch(() => "");
    const at = excerptFrom ? Math.max(0, text.indexOf(excerptFrom) - 80) : 0;
    log({ step: label, ms: ms(), url: p.url(), testids: ids, excerpt: text.slice(at, at + 700) });
    return { ids, text };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
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
  const leg = async (name, p, fn) => { try { await fn(); } catch (e) { log({ step: "leg_failed", leg: name, ms: ms(), error: e && e.message ? e.message.slice(0, 400) : String(e) }); if (p) { await shot(p, "99-failed-" + name); await observe(p, "leg_failed_dump_" + name).catch(() => {}); } } };

  const oc = await contextFor(ORG_EMAIL, { width: 1280, height: 900 }, "dark");
  const o = await oc.newPage();
  let companyResult = null, companyNamed = null;
  // ═══ G1 — company identity via the VISIBLE label (the way a person clicks) ══════════════════════════════════════════
  await leg("G1_org_company_setup", o, async () => {
    await o.goto(HOST + "/lt/dashboard/start/company", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("company-setup-form").waitFor({ timeout: 60000 });
    const nameField = o.getByTestId("company-setup-legal-name");
    const existing = await nameField.inputValue().catch(() => "");
    await nameField.fill(ORG_NAME);
    const radio = o.getByTestId("company-setup-company-type-construction");
    const radioPresent = (await radio.count()) > 0;
    let via = null;
    if (radioPresent) {
      const label = o.locator("label").filter({ has: radio }).first();
      if ((await label.count()) > 0) { await label.click(); via = "label"; }
      else { await radio.check({ force: true }); via = "force-check"; }
    }
    const checked = radioPresent ? await radio.isChecked() : null;
    await o.getByTestId("company-setup-country").selectOption("LT");
    await shot(o, "G1-company-form");
    await o.getByTestId("company-setup-save-draft").click();
    await o.getByTestId("company-setup-result").waitFor({ timeout: 60000 });
    companyResult = (await o.getByTestId("company-setup-result").innerText()).replace(/\s+/g, " ");
    log({ step: "G1_org_company_setup", ms: ms(), existingName: existing, typeVia: via, typeChecked: checked, result: companyResult.slice(0, 300), nextDoor: (await o.getByTestId("company-setup-go-workspace").count()) > 0 });
    await shot(o, "G1-company-saved");
  });
  await leg("G1_org_start_hub", o, async () => {
    await o.goto(HOST + "/lt/dashboard/start", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("activity-setup-hub").waitFor({ timeout: 60000 });
    const lane = (await o.getByTestId("activity-setup-lane-company").innerText()).replace(/\s+/g, " ");
    companyNamed = lane.includes(ORG_NAME);
    log({ step: "G1_org_start_hub", ms: ms(), companyLane: lane.slice(0, 300), companyStarted: /Pradėta/.test(lane), companyNamed });
    await shot(o, "G1-start-hub");
  });
  // ═══ G2 — project panel in the (now named) organisation context → assignment ═════════════════════════════════════
  let assigned = null;
  await leg("G2_org_project_panel", o, async () => {
    await o.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await o.waitForTimeout(6000);
    const chip = (await o.getByTestId("workspace-chip").innerText().catch(() => "")).replace(/\s+/g, " ");
    log({ step: "G2_org_workspace_chip", chip, named: chip.includes("E2E Spine") });
    const answer = await ask(o, "mano projektai", 30000);
    const fallback = /nepasiekiamas dabartiniame kontekste/.test(await body(o));
    const rows = o.locator('[data-testid^="project-row-"]');
    log({ step: "G2_org_projects_answer", excerpt: answer.slice(0, 300), fallback, rows: await rows.count(), projectNamed: (await body(o)).includes(PROJECT) });
    await shot(o, "G2-projects-list");
    const row = rows.filter({ hasText: PROJECT }).first();
    if ((await row.count()) > 0) { await row.click({ force: true }); await o.waitForTimeout(6000); }
    const detail = (await o.getByTestId("project-detail").count()) > 0;
    const assign = o.getByTestId("project-assign-worker").first();
    log({ step: "G2_org_project_panel", ms: ms(), detail, assignControl: (await assign.count()) > 0, noAssign: (await o.getByTestId("project-no-assign").count()) > 0 });
    await shot(o, "G2-project-panel");
    if ((await assign.count()) > 0) {
      await assign.click(); await o.waitForTimeout(6000);
      const pick = await body(o);
      const personChip = o.getByRole("button", { name: new RegExp(esc(PERSON_NAME)) }).last();
      log({ step: "G2_org_pick", asked: /Kas turėtų jame dirbti/.test(pick), none: /nėra ko priskirti/.test(pick), personChip: await personChip.count(), buttons: (await o.getByRole("button").allInnerTexts()).filter((s) => /E2E/.test(s)).slice(0, 6) });
      await shot(o, "G2-pick");
      if ((await personChip.count()) > 0) {
        await personChip.scrollIntoViewIfNeeded().catch(() => {}); await personChip.click({ timeout: 15000 }); await o.waitForTimeout(15000);
        const done = await body(o);
        assigned = /Priskirta projektui/.test(done) ? "assigned" : /Priskyrimo atlikti nepavyko/.test(done) ? "failed" : "unknown";
        log({ step: "G2_org_assigned", ms: ms(), assigned, tail: done.slice(-400) });
        await shot(o, "G2-assigned");
      }
    }
  });
  // ═══ G3 — readiness gap → ask (instruction) ═══════════════════════════════════════════════════════════════════════
  let askedInstruction = false;
  await leg("G3_org_readiness_gap", o, async () => {
    let t = await ask(o, `kas trūksta projektui ${PROJECT}?`, 60000);
    if (await clickButton(o, /^Pradėti dokumentų sąrašą/, 12000)) t = await body(o);
    const personLine = (t.match(new RegExp("• " + esc(PERSON_NAME) + "[^•]{0,200}")) || [null])[0];
    const askChip = o.getByRole("button", { name: new RegExp("^Paprašyti: " + esc(PERSON_NAME)) });
    log({ step: "G3_org_gap", ms: ms(), excerpt: t.slice(0, 500), personLine, askChip: (await askChip.count()) > 0, chips: (await o.getByRole("button").allInnerTexts()).filter((s) => /^(Paprašyti|Pradėti|Gauta|Patikrinta)/.test(s)).slice(0, 8) });
    await shot(o, "G3-gap");
    if ((await askChip.count()) > 0) {
      await askChip.last().click(); await o.waitForTimeout(12000);
      const after = await body(o);
      askedInstruction = /Nurodymas išsiųstas/.test(after);
      log({ step: "G3_org_instruction", sent: askedInstruction, said: (after.match(/Nurodymas išsiųstas[^.]*\./) || [null])[0] });
      await shot(o, "G3-instruction");
    }
  });
  // ═══ G4 — the person sees it (390 px, light) ══════════════════════════════════════════════════════════════════════
  const wc = await contextFor(PERSON_EMAIL, { width: 390, height: 844 }, "light");
  const w = await wc.newPage();
  await leg("G4_person_instructions", w, async () => {
    await w.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await w.waitForTimeout(9000);
    const brief = await body(w);
    log({ step: "G4_person_brief", ms: ms(), instructionsLine: (brief.match(/Laukia nurodymų[^.]*\./) || [null])[0], projectNamed: brief.includes(PROJECT), excerpt: brief.slice(0, 400) });
    await shot(w, "G4-person-brief");
    const projects = await ask(w, "mano projektai", 30000);
    log({ step: "G4_person_projects_chat", excerpt: projects.slice(0, 300), askLine: (projects.match(/Vadovas laukia:[^.]*\./) || [null])[0], projectNamed: projects.includes(PROJECT) });
    await shot(w, "G4-person-projects");
    await w.goto(HOST + "/lt/dashboard/instructions", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.waitForTimeout(6000);
    const obs = await observe(w, "G4_person_instructions_page", "nurodym");
    log({ step: "G4_person_instructions", ms: ms(), cards: await w.getByTestId("worker-instruction-card").count(), asks: (await w.getByTestId("instruction-project-ask").allInnerTexts()).slice(0, 8), empty: obs.ids.includes("instructions-empty"), projectNamed: obs.text.includes(PROJECT) });
    await shot(w, "G4-person-instructions");
  });
  await b.close();
  log({ step: "residue", identities: { org: ORG_EMAIL, person: PERSON_EMAIL, keep: true }, created: { companyNamed, companyResult, project: PROJECT, assignment: assigned, instruction: askedInstruction, since: startedAt },
    inspect: [
      `select id, legal_name, display_name, company_type, verification_status from companies where profile_id = '${ORG_ID}'`,
      `select id, title, city, status from projects where title = '${PROJECT}'`,
      `select * from project_worker_assignments where project_id in (select id from projects where title = '${PROJECT}')`,
      `select id, conversation_id, author_id, is_instruction, left(body,60) body, created_at from conversation_messages where (author_id in ('${ORG_ID}','${PERSON_ID}') or project_id in (select id from projects where title = '${PROJECT}')) and created_at >= '${startedAt}' order by created_at desc limit 10`,
      `select event_name, count(*) from pilot_events where profile_id in ('${ORG_ID}','${PERSON_ID}') and created_at >= '${startedAt}' group by 1 order by 2 desc`,
    ] });
  log({ step: "done", totalMs: ms() });
})().catch((e) => { console.error("REWALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
