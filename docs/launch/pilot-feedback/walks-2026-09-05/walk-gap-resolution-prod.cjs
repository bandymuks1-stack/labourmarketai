// ONE consolidated production walk — the GAP-RESOLUTION journey (owner correction 2026-09-05), acceptance 1–10:
//  M1 manager "kas trūksta projektui …?" → a REAL gap on E2E Worker Two (1) → "Paprašyti" = the instruction (corrective);
//  W1 the person's brief "Laukia nurodymų" (2) → "mano projektai" = the exact rows + own document state (2/3) →
//     the instructions PAGE shows the SAME rows (10, visual parity) → "Įrašyti: …" = the add-document form prefilled (3)
//     → saved (4) → the instruction thread offered → own words → confirm → sent (4);
//  M2 manager "kas trūksta …?" → the person's line carries "atsakė …" — status only, never the document (5/6) →
//     "Gauta" → re-read → "Patikrinta" (7) → checked/total moved (8) → "kuris projektas rizikoje?" agrees (9, project);
//  W2 the person's "mano dokumentai" counts the new record (9, person). Every write = an existing canonical action.
// Readback (MCP, print after): see the `readback` line at the end. Residue to delete via MCP: the worker_documents row,
// the reply + instruction message rows; restore the touched readiness row to `needed` (it is E2E data).
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const PERSON = "E2E Worker Two";
const PROJECT = "E2E Vilniaus objektas (testinis)";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-gap-resolution"); fs.mkdirSync(OUT, { recursive: true });
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
  const b = await chromium.launch();
  const open = async (email, viewport) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    return p;
  };
  const say = async (p, s, re, max = 16) => {
    const before = (await p.locator("body").innerText()).length;
    await p.getByTestId("composer-input").fill(s); await p.getByTestId("composer-input").press("Enter");
    let tail = "";
    for (let i = 0; i < max; i++) { await p.waitForTimeout(1500); const full = await p.locator("body").innerText(); tail = full.length >= before ? full.slice(before) : full; if (re.test(tail)) break; }
    return tail;
  };
  const click = async (p, re, ms) => { const btn = p.getByRole("button", { name: re }).last(); if ((await btn.count()) === 0) return false; await btn.click(); await p.waitForTimeout(ms); return true; };
  const personLine = (text) => { const all = text.match(new RegExp("• " + PERSON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*", "g")) || []; return all.length ? all[all.length - 1] : null; };
  const t0 = Date.now();

  // ── M1 ── the manager identifies a real gap and asks for it
  const m = await open(MANAGER, { width: 1280, height: 900 });
  let mt = await say(m, `kas trūksta projektui ${PROJECT}?`, /Parengtis|Dokumentų sąrašas/);
  if (await click(m, /^Pradėti dokumentų sąrašą/, 12000)) mt = await m.locator("body").innerText();
  log({ step: "M1_gap", ms: Date.now() - t0, line: personLine(mt), askChip: (await m.getByRole("button", { name: `Paprašyti: ${PERSON}`, exact: true }).count()) > 0 });
  await m.screenshot({ path: path.join(OUT, "01-manager-gap.png") });
  const asked = await click(m, new RegExp(`^Paprašyti: ${PERSON}$`), 12000);
  log({ step: "M1_instruction", asked, said: ((await m.locator("body").innerText()).match(/Nurodymas išsiųstas[^\n]*/) || [null])[0] });
  await m.screenshot({ path: path.join(OUT, "02-manager-asked.png") });

  // ── W1 ── the person sees the gap, the exact rows, records, answers
  const w = await open(WORKER, { width: 390, height: 844 });
  await w.waitForTimeout(9000); // the brief is pushed asynchronously after mount
  const brief = await w.locator("body").innerText();
  log({ step: "W1_brief", ms: Date.now() - t0, instructionsLine: (brief.match(/Laukia nurodymų[^\n]*/) || [null])[0] });
  const wt = await say(w, "mano projektai", /Vadovas laukia|Jūsų projektai/);
  const askLine = (wt.match(/Vadovas laukia:[^\n]*/) || [null])[0];
  log({ step: "W1_asks_chat", askLine, ownStates: (askLine || "").match(/\((turite|baigia galioti|neįrašyta)\)/g) });
  await w.screenshot({ path: path.join(OUT, "03-person-asks-chat.png") });
  // visual parity: the instructions page renders the SAME rows
  const v = await w.context().newPage();
  await v.goto("https://labourmarket.ai/lt/dashboard/instructions", { waitUntil: "domcontentloaded", timeout: 60000 });
  await v.getByTestId("worker-instruction-card").first().waitFor({ timeout: 60000 });
  const visualRows = await v.getByTestId("instruction-project-ask").allInnerTexts();
  log({ step: "W1_asks_visual", rows: visualRows.slice(0, 8), recordLink: (await v.getByTestId("instruction-project-asks-record").count()) > 0 });
  await v.screenshot({ path: path.join(OUT, "04-person-asks-page.png") });
  await v.close();
  // record over the SAME add-document form, prefilled
  const chip = w.getByRole("button", { name: /^Įrašyti: / }).first();
  if ((await chip.count()) === 0) throw new Error("no record chip");
  const chipLabel = await chip.innerText();
  await chip.click();
  const form = w.getByTestId("inline-action-form-worker.add-document");
  await form.waitFor({ timeout: 30000 });
  const typeValue = await form.getByTestId("field-typeSlug").first().inputValue();
  log({ step: "W1_form", chipLabel, typeValue });
  await w.getByTestId("inline-action-continue").click();
  await w.getByTestId("inline-action-review").waitFor({ timeout: 30000 });
  await w.getByTestId("inline-action-save").click();
  await w.getByTestId("inline-action-done").last().waitFor({ timeout: 60000 });
  let after = "";
  for (let i = 0; i < 16; i++) { await w.waitForTimeout(1500); after = await w.locator("body").innerText(); if (/prašė šio dokumento|Dokumentas užrašytas/.test(after)) break; }
  const later = w.getByRole("button", { name: /^Vėliau/ }).last();
  if ((await later.count()) > 0) { await later.click(); await w.waitForTimeout(4000); after = await w.locator("body").innerText(); log({ step: "W1_file_offer_declined" }); }
  const input = w.locator('[data-testid^="chat-reply-input-"]').last();
  log({ step: "W1_recorded", saidRecorded: /Dokumentas užrašytas|Įrašyta/.test(after), replyOffered: (await input.count()) > 0 });
  await w.screenshot({ path: path.join(OUT, "05-person-recorded.png") });
  let conv = null;
  if ((await input.count()) > 0) {
    conv = (await input.getAttribute("data-testid")).replace("chat-reply-input-", "");
    await input.fill("Įrašiau dokumentą, kurio prašėte.");
    await w.getByTestId(`chat-reply-review-${conv}`).click();
    await w.getByTestId(`chat-reply-confirm-${conv}`).waitFor({ timeout: 20000 });
    await w.getByTestId(`chat-reply-confirm-${conv}`).click();
    await w.getByTestId(`chat-reply-sent-${conv}`).waitFor({ timeout: 30000 });
    log({ step: "W1_answered", conversationId: conv });
    await w.screenshot({ path: path.join(OUT, "06-person-answered.png") });
  }

  // ── M2 ── the manager sees the authorized status only, marks received, then checked; readiness recalculates
  mt = await say(m, `kas trūksta projektui ${PROJECT}?`, /Parengtis/, 24);
  const lineAfterAnswer = personLine(mt);
  log({ step: "M2_answer_visible", line: lineAfterAnswer, replied: /atsakė \d{4}-\d{2}-\d{2}: „/.test(lineAfterAnswer || ""), documentContentLeaked: /\.pdf|file|failas/i.test(lineAfterAnswer || "") });
  await m.screenshot({ path: path.join(OUT, "07-manager-answer.png") });
  const got = await click(m, /^Gauta: /, 12000);
  mt = await m.locator("body").innerText();
  log({ step: "M2_received", got, said: (mt.match(/Pažymėta gauta[^\n]*/) || [null])[0], checkedChip: (await m.getByRole("button", { name: /^Patikrinta: / }).count()) > 0 });
  const checked = await click(m, /^Patikrinta: /, 12000);
  mt = await m.locator("body").innerText();
  const lineAfterCheck = personLine(mt);
  log({ step: "M2_checked", checked, said: (mt.match(/Pažymėta patikrinta[^\n]*/) || [null])[0], line: lineAfterCheck, ratio: (lineAfterCheck || "").match(/\((\d+)\/(\d+)\)/) });
  await m.screenshot({ path: path.join(OUT, "08-manager-checked.png") });
  const risk = await say(m, "kuris projektas rizikoje?", /Projektų būklė/, 30);
  log({ step: "M2_project_state", line: (risk.match(new RegExp("• " + PROJECT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*")) || [null])[0] });

  // ── W2 ── the person's own state
  const docs = await say(w, "mano dokumentai", /dokument/i);
  log({ step: "W2_person_documents", lines: docs.split("\n").filter((l) => /dokument/i.test(l)).slice(0, 4) });
  await w.screenshot({ path: path.join(OUT, "09-person-documents.png") });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0, readback: "select item_key, label, status, updated_at from project_worker_readiness_items where worker_id='0dbd5eda-59b3-4f89-8d8e-01f41a542bd2' order by updated_at desc; select id, document_type_slug, status, created_at from worker_documents where worker_id='0dbd5eda-59b3-4f89-8d8e-01f41a542bd2' order by created_at desc limit 2; select id, conversation_id, author_id, is_instruction, left(body,60) body, created_at from conversation_messages where project_id='3b9c55d3-0fc1-40ac-9576-7937be41a55c'::uuid or conversation_id='" + (conv || "") + "' order by created_at desc limit 4" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
