// PRODUCTION WALK — LANE D: living evidence → profile → opportunity (window 6).
//
// WHAT IT PROVES against production, with the bounded E2E identities, through
// the NATURAL product path only (chat-first journal intake; the company's
// one-tap confirm queue; the company's own-need candidates result):
//
//   BEFORE  COMPANY: candidates for its own open need (Suvirintojas) — is worker2 there?
//           WORKER : the journal page's skill chart + the "ieškau darbo" board.
//   ACTION  WORKER : ONE real journal entry via chat ("Užpildyk darbo žurnalą" → form →
//                    two-step save) whose sentence the offline recogniser reads as
//                    welding-blueprint (+ structural-steel) — the skill the open need
//                    requires and worker2 lacks (0 worker_skills rows before).
//   CONFIRM COMPANY: /dashboard/inbox/quick → tap confirm on that entry
//                    (confirm_entry_and_verify_skills → verified=true, manager_confirmed).
//   AFTER   the same three readbacks + the worker's profile provenance line.
//
// The rows this creates are CONTROLLED and are rolled back afterwards via SQL
// (see the walk log). Never run against a build other than EXPECT_BUILD.
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-living-evidence-loop/walk-living-evidence-loop-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const COMPANY = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const WORKER_ID = "0dbd5eda-59b3-4f89-8d8e-01f41a542bd2"; // workers.id (JWT sub is the PROFILE id)
const NEED_ID = "b0a48f65-6152-40eb-8080-986f87dca211"; // E2E Walker UAB · "Suvirintojas" · submitted
const MARKER = "LANE-D-" + Date.now().toString(36);
const SENTENCE = "Suvirinau metalo konstrukcijas pusautomačiu. " + MARKER;

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = __dirname; fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };
// A DB-edge check is only meaningful when the in-run mirror could read; when
// production denies service_role the table, the edge is asserted from the
// execute_sql readback in the walk log and logged here as skipped, not failed.
const mustDb = (db, name, ok, detail) => { if (db && db.unavailable) { log({ check: name, skipped: "service_role read denied — see execute_sql readback", detail: db.readErrors }); return; } must(name, ok, detail); };

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
  const open = async (email, viewport, pathname) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    await p.goto(HOST + pathname, { waitUntil: "domcontentloaded", timeout: 90000 });
    return { c, p, failed };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const textOf = async (loc) => (await loc.first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

  // Admin (service-role) readback of the canonical rows — READ ONLY here.
  // Every read reports its own error: a failed read must never be logged as
  // "no rows" (run 1 of this walk did exactly that; the canonical readback is
  // the execute_sql one in the walk log — this is the in-run mirror).
  const readback = async (label, entryId) => {
    const ws = await admin.from("worker_skills").select("skill_id, source, verified, verified_by, confidence_bin, skills(slug)").eq("worker_id", WORKER_ID);
    const links = await admin.from("journal_entry_skills").select("journal_entry_id, skill_id, provenance, skills(slug)").eq("worker_id", WORKER_ID);
    const entries = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("worker_id", WORKER_ID);
    let confirmations = null, confErr = null;
    if (entryId) { const c = await admin.from("journal_entry_confirmations").select("confirmer_id, confirmer_role, confirmation_scope, created_at").eq("entry_id", entryId); confirmations = c.data; confErr = c.error?.message ?? null; }
    const r = {
      readback: label,
      // Production revokes service_role's table grants ("permission denied for
      // table …"): the in-run mirror is then UNAVAILABLE and the DB edges are
      // asserted from the execute_sql readbacks in the walk log instead.
      unavailable: Boolean(ws.error || links.error || entries.error || confErr),
      readErrors: { worker_skills: ws.error?.message ?? null, links: links.error?.message ?? null, entries: entries.error?.message ?? null, confirmations: confErr },
      entries: entries.count,
      worker_skills: (ws.data ?? []).map((x) => ({ slug: x.skills?.slug, source: x.source, verified: x.verified, bin: x.confidence_bin })),
      links: (links.data ?? []).map((x) => ({ entry: x.journal_entry_id, slug: x.skills?.slug, provenance: x.provenance })),
      confirmations,
    };
    log(r); return r;
  };
  // Resume mode: PHASE=confirm ENTRY_ID=<uuid> MARKER=<marker> skips BEFORE +
  // ACTION and drives CONFIRM + AFTER against the entry run 1 already created
  // (never a second controlled row).
  const RESUME = (process.env.PHASE === "confirm" || process.env.PHASE === "after") && /^[0-9a-f-]{36}$/.test(process.env.ENTRY_ID || "");
  // PHASE=after additionally skips the company confirm (already done) and only
  // re-reads the AFTER surfaces.
  const AFTER_ONLY = process.env.PHASE === "after" && RESUME;
  const MARKER_EFFECTIVE = RESUME ? (process.env.MARKER || MARKER) : MARKER;

  // ── COMPANY: candidates for its own need (the employer-side consumer) ──────
  const companyCandidates = async (label) => {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 900 }, "/lt/dashboard?result=candidates&demand=" + NEED_ID);
    const view = p.locator('[data-testid="candidates-view"], [data-testid="candidates-empty"], [data-testid="candidates-not-structured"]');
    await view.first().waitFor({ timeout: 90000 }).catch(() => {});
    const state = await view.first().getAttribute("data-testid").catch(() => null);
    const header = await textOf(p.getByTestId("candidates-demand-header"));
    const card = p.getByTestId("candidate-" + WORKER_ID);
    const present = (await card.count()) > 0;
    let cardText = "";
    if (present) {
      cardText = await textOf(card);
      await p.getByTestId("candidate-open-" + WORKER_ID).click({ timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(2500);
      cardText = await textOf(card);
    }
    const all = await p.locator('[data-testid^="candidate-"]:not([data-testid^="candidate-open"]):not([data-testid^="candidate-stage"])').count();
    log({ leg: "company_candidates_" + label, state, header, worker2Present: present, cardText: cardText.slice(0, 600), candidatesOnScreen: all, failed: failed.slice(0, 5) });
    await shot(p, label + "-company-candidates");
    await c.close();
    return { state, present, cardText };
  };

  // ── WORKER: the journal page's skill chart + provenance, and the board ─────
  const workerSurfaces = async (label) => {
    const { c, p, failed } = await open(WORKER, { width: 390, height: 844 }, "/lt/dashboard/journal");
    await p.waitForTimeout(8000);
    // The player card ("Mano kortelė") is a collapsed disclosure on this page —
    // open it the way a person does, then read the card's own provenance line.
    const lead = p.locator("#mano-cv-identity");
    if ((await lead.count()) > 0) {
      await lead.evaluate((d) => { d.open = true; }).catch(() => {});
      await p.waitForTimeout(1500);
    }
    const provenance = await textOf(p.getByTestId("player-card-provenance"));
    const signals = await textOf(p.getByTestId("player-card-skill-signals"));
    const journalSupported = await textOf(p.getByTestId("player-card-journal-supported"));
    const chart = await textOf(p.getByTestId("player-card-skill-chart"));
    const body = (await p.evaluate(() => document.body.innerText).catch(() => "")).replace(/\s+/g, " ");
    const provenanceLine = (body.match(/Patvirtino [^.]{0,80}|Pagrįsta darbo žurnalo įrašais|Pateikta paties|dar nepatvirtinta|Patvirtinta vadovo[^.]{0,40}|Laukia žmogaus peržiūros/g) ?? []).slice(0, 8);
    const hasMarker = body.includes(MARKER_EFFECTIVE);
    // The entry's own row: its skill chips + review status, as the worker reads them.
    const entryRow = (body.match(new RegExp("Suvirinau[^]{0,900}?" + MARKER_EFFECTIVE + "[^]{0,700}")) ?? [""])[0].slice(0, 700);
    log({ leg: "worker_journal_" + label, provenance, signals: signals.slice(0, 300), journalSupported: journalSupported.slice(0, 200), chart: chart.slice(0, 300), provenanceLine, entryVisible: hasMarker, entryRow, failed: failed.slice(0, 5) });
    await shot(p, label + "-worker-journal");
    await c.close();
    return { chart: chart + " " + provenance + " " + signals, provenanceLine, hasMarker };
  };

  // ═════════════════════════ BEFORE ═════════════════════════
  let before = null;
  if (!RESUME) {
    before = { db: await readback("BEFORE", null), company: await companyCandidates("01-before"), worker: await workerSurfaces("02-before") };
    mustDb(before.db, "BEFORE: worker2 has zero worker_skills rows (the loop starts from nothing)", before.db.worker_skills.length === 0, before.db.worker_skills);
  } else {
    log({ step: "resume", entryId: process.env.ENTRY_ID, marker: MARKER_EFFECTIVE });
  }

  // ═════════════════════════ ACTION (WORKER, chat-first intake) ═════════════
  let entryId = RESUME ? process.env.ENTRY_ID : null;
  if (!RESUME) {
    const { c, p, failed } = await open(WORKER, { width: 390, height: 844 }, "/lt/dashboard");
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.getByTestId("composer-input").fill("Užpildyk darbo žurnalą");
    await p.getByTestId("composer-input").press("Enter");
    await p.getByTestId("worklog-flow").waitFor({ timeout: 60000 });
    await p.getByTestId("worklog-date").fill("2026-09-06");
    await p.getByTestId("worklog-site").fill("Vilnius, gamybos cechas");
    await p.getByTestId("worklog-notes").fill(SENTENCE);
    const ctx = p.getByTestId("worklog-context");
    if ((await ctx.count()) > 0) {
      const opts = await ctx.locator("option").evaluateAll((ns) => ns.map((n) => ({ v: n.value, t: n.textContent.trim() })));
      const pick = opts.find((o) => o.v !== "" && /walker/i.test(o.t)) ?? opts.find((o) => o.v !== "");
      log({ step: "worklog_context_options", opts, picked: pick });
      if (pick) await ctx.selectOption(pick.v);
    }
    await shot(p, "03-worker-form-filled");
    await p.getByTestId("worklog-save").click();
    await p.getByTestId("worklog-confirm").waitFor({ timeout: 20000 });
    await p.getByTestId("worklog-confirm").click();
    await p.getByTestId("worklog-done").waitFor({ timeout: 60000 });
    await p.waitForTimeout(1500);
    const outcome = await textOf(p.getByTestId("worklog-outcome"));
    const added = await p.locator('[data-testid^="worklog-added-"]').evaluateAll((ns) => ns.map((n) => n.getAttribute("data-testid")));
    const pending = await p.getByTestId("worklog-pending-candidate").count();
    const cvUpdated = (await p.getByTestId("worklog-cv-updated").count()) > 0;
    const matchingNote = (await p.getByTestId("worklog-matching-note").count()) > 0;
    const err = await textOf(p.getByTestId("worklog-error"));
    log({ leg: "worker_action_saved", outcome, added, pending, cvUpdated, matchingNote, error: err, failed: failed.slice(0, 5) });
    must("ACTION: the save reports the recognised skill as ADDED (welding-blueprint)", added.includes("worklog-added-welding-blueprint"), added);
    must("ACTION: the save says the CV/profile was updated", cvUpdated, cvUpdated);
    await shot(p, "04-worker-saved-outcome");
    await c.close();
    const found = await admin.from("journal_entries").select("id, engagement_context_id, created_at").eq("worker_id", WORKER_ID).ilike("original_text", "%" + MARKER + "%");
    const rows = found.data;
    entryId = rows?.[0]?.id ?? null;
    log({ step: "entry_persisted", entryId, engagement: rows?.[0]?.engagement_context_id ?? null, readError: found.error?.message ?? null });
    must("ACTION: exactly one journal_entries row persisted for the marker", (rows ?? []).length === 1, rows ?? found.error?.message);
  }
  const mid = await readback("AFTER_ENTRY_BEFORE_CONFIRM", entryId);
  mustDb(mid, "EDGE journal→profile: worker_skills now holds welding-blueprint at source=work_journal, verified=false", mid.worker_skills.some((s) => s.slug === "welding-blueprint" && s.source === "work_journal" && s.verified === false), mid.worker_skills);
  mustDb(mid, "EDGE entry→skill link: journal_entry_skills links the entry to welding-blueprint with provenance=recognized", mid.links.some((l) => l.entry === entryId && l.slug === "welding-blueprint" && l.provenance === "recognized"), mid.links);

  // ═════════════════════════ CONFIRM (COMPANY, one-tap queue) ═══════════════
  if (!AFTER_ONLY) {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 900 }, "/lt/dashboard/inbox/quick");
    const card = p.getByTestId("quick-confirm-card-" + entryId);
    await card.waitFor({ timeout: 90000 }).catch(() => {});
    const present = (await card.count()) > 0;
    const willConfirm = await textOf(p.getByTestId("quick-will-confirm-" + entryId));
    const cardText = await textOf(card);
    log({ leg: "company_quick_queue", present, cardText: cardText.slice(0, 500), willConfirm, failed: failed.slice(0, 5) });
    must("CONFIRM: the entry reaches the company's one-tap queue", present, cardText.slice(0, 200));
    must("CONFIRM: the card names the worker (not a dash)", /E2E Worker Two/.test(cardText), cardText.slice(0, 120));
    await shot(p, "05-company-quick-queue");
    if (present) {
      await p.getByTestId("quick-confirm-tap-" + entryId).click();
      await p.getByTestId("quick-confirmed-" + entryId).waitFor({ timeout: 60000 }).catch(() => {});
      const confirmed = (await p.getByTestId("quick-confirmed-" + entryId).count()) > 0;
      log({ leg: "company_quick_confirmed", confirmed, text: await textOf(p.getByTestId("quick-confirmed-" + entryId)) });
      must("CONFIRM: the tap lands as confirmed", confirmed, confirmed);
      await shot(p, "06-company-confirmed");
    }
    await c.close();
  }

  // ═════════════════════════ AFTER ══════════════════════════
  const after = { db: await readback("AFTER", entryId), company: await companyCandidates("07-after"), worker: await workerSurfaces("08-after") };
  mustDb(after.db, "EDGE confirm→capability: welding-blueprint is verified=true, source=manager_confirmed, bin=green", after.db.worker_skills.some((s) => s.slug === "welding-blueprint" && s.source === "manager_confirmed" && s.verified === true && s.bin === "green"), after.db.worker_skills);
  mustDb(after.db, "EDGE confirm row: journal_entry_confirmations carries the company owner as confirmer with action=confirm", (after.db.confirmations ?? []).some((x) => x.confirmation_scope?.action === "confirm"), after.db.confirmations);
  must("EDGE capability→matching (employer): worker2 now appears in the company's candidates for its own need", after.company.present, { before: before?.company.present ?? "(resumed)", after: after.company.present, state: after.company.state });
  must("EDGE matching→UI: the candidate card shows the confirmed / skill-fit reading", /patvirtin|tinka|stipr|1\s*\/\s*1|100/i.test(after.company.cardText), after.company.cardText.slice(0, 300));
  must("EDGE profile provenance: the worker's journal page shows the confirming organisation", after.worker.provenanceLine.some((l) => /Patvirtino E2E Walker/i.test(l)) || /E2E Walker/.test(after.worker.chart), { lines: after.worker.provenanceLine, chart: after.worker.chart.slice(0, 200) });

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail, entryId, marker: MARKER_EFFECTIVE });
  process.exit(fail.length === 0 ? 0 : 1);
})();
