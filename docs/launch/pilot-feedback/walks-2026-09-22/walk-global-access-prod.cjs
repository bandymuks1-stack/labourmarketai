// Production walk — GLOBAL ACCESS for representative countries (owner directive 2026-09-22 §2:
// LT SE DE IE VN US SA GE PH). MARKET PRIORITY != ACCESS PERMISSION: a market list may ORDER a
// select, it may never SHORTEN it. This walk drives the SHIPPED UI with the two EXISTING E2E
// identities from the 09-05 walks and proves, per country code, on the production build:
//
//  (1) company setup  /lt/dashboard/start/company  [company-setup-country] selectOption(code) →
//      save draft → the result banner is NOT the invalid-country text → service-role read-back
//      companies.country = code AND organizations.country = code (values ONLY for the E2E org).
//  (2) work card      /lt/dashboard?result=player-card → [work-card-editor-toggle] → the editor:
//      name=location_country gets the country NAME in the UI locale (lt: "Vietnamas", "Airija",
//      "Saudo Arabija"), name=preferred_countries gets the NAMES list → save → read-back
//      workers.current_location_country = code, workers.preferred_countries = the codes.
//  (3) demand DRAFT   /lt/dashboard/company/needs → [demand-role] + [demand-description] →
//      [demand-next] → [demand-country-select] (DarkListbox, option by its lt label) →
//      [demand-save-draft] → [demand-draft-saved] → read-back customer_requests (status=draft,
//      kind=company_request, profile_id=manager).country = code + payload.country = code.
//      NEVER [demand-create]: no public/visible demand is submitted by this walk.
//  (4) onboarding select (observation): /lt/onboarding with each identity — an onboarded
//      profile is forwarded away, which is logged as `unreachable_onboarded` (no user is created
//      to reach it). When the wizard IS reachable, select[name=country] must list the code.
//
// Convention (walks-2026-09-05/walk-full-spine-README.md): /api/health build pinned to
// EXPECT_BUILD; sessions minted for the EXISTING e2e-*@labourmarket.ai identities via
// admin.generateLink + verifyOtp; env read by NAME from apps/web/.env.local and never printed;
// one JSON line per step; screenshots per country in ./walk-global-access/; a residue register
// at the end (every row touched, exact delete order / restore statements, auth.users/profiles
// KEPT, the QA profile_ids + organization_ids + run window so the rows are excludable from
// pilot metrics). A failed leg logs `leg_failed` + a screenshot and the walk CONTINUES.
//
// Refusals (exit 1 before any browser opens): EXPECT_BUILD missing / build mismatch; the
// Supabase host is not the production project; an identity does not exist (NEEDS_IDENTITY —
// this walk never creates auth users).
//
// Command (PowerShell):
//   $env:EXPECT_BUILD="<sha7>"; node "<worktree>\docs\launch\pilot-feedback\walks-2026-09-22\walk-global-access-prod.cjs" | Tee-Object walk-global-access.log
// Optional: WALK_ROOT=<repo root> (default: resolved from __dirname — never the stale
// C:/Users/Mano/Documents/labourmarketai checkout); WALK_ENV_FILE=<path to an apps/web/.env.local>
// (default ROOT/apps/web/.env.local); WALK_COUNTRIES="LT,VN" to narrow; WALK_RESTORE=0 to
// leave the last country in place (default restores the baselines through the same UI).
const fs = require("node:fs"), path = require("node:path");
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required (7+ hex of the deployed SHA)");
const ROOT = (process.env.WALK_ROOT || path.resolve(__dirname, "..", "..", "..", "..")).replace(/\\/g, "/");
// The env file is read by NAME only and never printed. A worktree usually has no .env.local
// (gitignored) — point WALK_ENV_FILE at the one in a checkout that has it, without copying it.
const ENV_FILE = (process.env.WALK_ENV_FILE || ROOT + "/apps/web/.env.local").replace(/\\/g, "/");
for (const need of ["/node_modules/@playwright/test", "/node_modules/@supabase/supabase-js"]) {
  if (!fs.existsSync(ROOT + need)) throw new Error(`WALK_ROOT ${ROOT} is missing ${need} — run from a worktree with node_modules, or set WALK_ROOT`);
}
if (!fs.existsSync(ENV_FILE)) throw new Error(`env file ${ENV_FILE} not found — set WALK_ENV_FILE to an apps/web/.env.local that holds NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY`);
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const txt = fs.readFileSync(ENV_FILE, "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^"|"$/g, "") : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-global-access"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
const PROJECT_REF = "gorgitwvdzxbnaxhrsrw";
const STAMP = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12); // yyyymmddHHMM (UTC)
const UI_LOCALE = "lt";
// Owner §2 representative countries. Order = the order of the walk; the LAST one is what is
// left in place when WALK_RESTORE=0.
const ALL_CODES = ["LT", "SE", "DE", "IE", "VN", "US", "SA", "GE", "PH"];
const CODES = (process.env.WALK_COUNTRIES ? process.env.WALK_COUNTRIES.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : ALL_CODES).filter((c) => ALL_CODES.includes(c));
if (CODES.length === 0) throw new Error("WALK_COUNTRIES names none of " + ALL_CODES.join(","));
// The EXISTING identities (walks-2026-09-05: walk-stripe-live-prod.cjs MANAGER / walk-invitation-prod.cjs WORKER).
// Never invented here; an override must still be an e2e-*@labourmarket.ai address.
const MANAGER = process.env.WALK_MANAGER_EMAIL || "e2e-walker-202609021438@labourmarket.ai";
const WORKER = process.env.WALK_WORKER_EMAIL || "e2e-worker2-202609021527@labourmarket.ai";
for (const e of [MANAGER, WORKER]) if (!/^e2e-[a-z0-9-]+@labourmarket\.ai$/.test(e)) throw new Error("identity must be an existing e2e-*@labourmarket.ai address: " + e);
// Country NAMES in the UI locale come from the same CLDR data the product uses
// (lib/location/country-model.ts countryDisplayName) — Node 24 ships full ICU.
const nameOf = (code, locale = UI_LOCALE) => new Intl.DisplayNames([locale, "en"], { type: "region", fallback: "code" }).of(code);
const DRAFT_ROLE = "E2E Global Access (testinis)";
const DRAFT_DESCRIPTION = "Reikia 1 darbuotojo — E2E global-access patikra, juodraštis, nesiunčiama.";
(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build, expect: EXPECT_BUILD.slice(0, 7), stamp: STAMP, root: ROOT, codes: CODES });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) { console.error("REFUSED: /api/health build " + health.build + " does not start with EXPECT_BUILD " + EXPECT_BUILD.slice(0, 7)); process.exit(1); }
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); if (!url.includes(PROJECT_REF)) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not the production project");
  for (const k of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) if (!get(k)) throw new Error(k + " missing in apps/web/.env.local");
  const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const anonClient = () => createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const startedAt = new Date().toISOString();
  const t0 = Date.now(); const ms = () => Date.now() - t0;

  // ── L0 — the identities must EXIST (generateLink fails for an unknown e-mail); nothing is created ──
  const identity = async (email, tag) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data || !data.user) { log({ step: "NEEDS_IDENTITY", identity: tag, email, error: error ? error.message : "no user" }); console.error(`NEEDS_IDENTITY: ${tag} ${email} does not exist — this walk never creates auth users; use an existing e2e-*@labourmarket.ai identity from the 09-05 walks (WALK_${tag.toUpperCase()}_EMAIL)`); process.exit(1); }
    return { id: data.user.id, otp: data.properties.email_otp };
  };
  const managerIdentity = await identity(MANAGER, "manager");
  const workerIdentity = await identity(WORKER, "worker");
  const session = async (email, otp) => {
    const { data: sess, error } = await anonClient().auth.verifyOtp({ email, token: otp, type: "magiclink" }); if (error) throw error;
    return "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  };
  // service-role reads — values ONLY for the two E2E identities
  const q = async (table, select, filters) => { let s = admin.from(table).select(select); for (const [k, v] of Object.entries(filters)) s = s.eq(k, v); const { data, error } = await s; return { rows: data || [], error: error ? error.message : null }; };
  const companiesOf = () => q("companies", "id, legal_name, country, verification_status, profile_id", { profile_id: managerIdentity.id });
  const orgsOf = async (companyIds) => { const { data, error } = await admin.from("organizations").select("id, legal_name, country, legacy_company_id").in("legacy_company_id", companyIds); return { rows: data || [], error: error ? error.message : null }; };
  const workerRow = () => q("workers", "id, profile_id, current_location_country, preferred_countries, work_card_confirmed_at", { profile_id: workerIdentity.id });
  const draftRow = () => q("customer_requests", "id, status, kind, country, title, organization_id, payload, updated_at", { profile_id: managerIdentity.id, kind: "company_request", status: "draft" });
  const baseline = { companies: (await companiesOf()).rows, worker: (await workerRow()).rows[0] || null, draft: (await draftRow()).rows[0] || null };
  baseline.organizations = baseline.companies.length ? (await orgsOf(baseline.companies.map((c) => c.id))).rows : [];
  const { data: seeded, error: seededErr } = await admin.from("countries").select("code").in("code", ALL_CODES);
  const seededCodes = (seeded || []).map((r) => r.code);
  const { count: countriesTotal } = await admin.from("countries").select("code", { count: "exact", head: true });
  log({ step: "L0_identities", manager: { email: MANAGER, profile_id: managerIdentity.id }, worker: { email: WORKER, profile_id: workerIdentity.id }, keep: true, note: "auth.users + profiles are KEPT; both are E2E QA identities — exclude their profile_ids from pilot metrics" });
  log({ step: "L0_baseline", companies: baseline.companies.map((c) => ({ id: c.id, legal_name: c.legal_name, country: c.country, verification_status: c.verification_status })), organizations: baseline.organizations.map((o) => ({ id: o.id, country: o.country, legacy_company_id: o.legacy_company_id })), worker: baseline.worker ? { id: baseline.worker.id, current_location_country: baseline.worker.current_location_country, preferred_countries: baseline.worker.preferred_countries } : null, draft: baseline.draft ? { id: baseline.draft.id, country: baseline.draft.country, title: baseline.draft.title, payloadKeys: Object.keys(baseline.draft.payload || {}) } : null });
  log({ step: "L0_countries_table", total: countriesTotal, seededOfNine: seededCodes, missing: ALL_CODES.filter((c) => !seededCodes.includes(c)), error: seededErr ? seededErr.message : null, note: "organizations.country has an FK to countries(code): a missing code fails company setup with invalid_country until migration 20260922120000_countries_all_iso_v1 is applied (owner gate)" });
  if (baseline.companies.length !== 1) log({ step: "L0_company_shape", n: baseline.companies.length, note: baseline.companies.length === 0 ? "the manager has no company row — leg (1) will fail until one exists" : "several companies — /dashboard/start/company edits the legacy singleton; read-back reports every row" });
  if (baseline.companies.some((c) => c.verification_status === "verified")) log({ step: "L0_company_locked", note: "a VERIFIED company has a LOCKED country (company-setup-form legalLocked) — leg (1) cannot change it through the UI; expected to report locked" });

  const b = await chromium.launch();
  const ORG_VIEW = { width: 1280, height: 900 }, PERSON_VIEW = { width: 390, height: 844 };
  const contextFor = async (email, otp, viewport, colorScheme) => {
    const c = await b.newContext({ viewport, locale: `${UI_LOCALE}-LT`, colorScheme });
    await c.addCookies([{ name: `sb-${PROJECT_REF}-auth-token`, value: await session(email, otp), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    return c;
  };
  const body = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ");
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});
  const observe = async (p, label) => {
    const ids = await p.locator("[data-testid]").evaluateAll((els) => Array.from(new Set(els.map((e) => e.getAttribute("data-testid")))).slice(0, 80)).catch(() => []);
    const text = await body(p).catch(() => "");
    log({ step: label, ms: ms(), url: p.url(), testids: ids, excerpt: text.slice(0, 600) });
  };
  const results = {}; // code → { company, workCard, draft, onboarding }
  const mark = (code, leg, ok, detail) => { results[code] = results[code] || {}; results[code][leg] = { ok, ...detail }; log({ step: `${code}_${leg}`, ms: ms(), ok, ...detail }); };
  const leg = async (code, name, p, fn) => { try { await fn(); } catch (e) { mark(code, name, false, { error: e && e.message ? e.message.slice(0, 400) : String(e) }); if (p) { await shot(p, `${code}-99-failed-${name}`); await observe(p, `${code}_leg_failed_dump_${name}`).catch(() => {}); } } };

  // The generateLink OTP is single-use: the manager and the worker each get ONE context for the whole walk.
  const oc = await contextFor(MANAGER, managerIdentity.otp, ORG_VIEW, "dark");
  const wc = await contextFor(WORKER, workerIdentity.otp, PERSON_VIEW, "light");
  const o = await oc.newPage(); const w = await wc.newPage();
  const INVALID_COUNTRY_TEXT = "Pasirinkite šalį iš sąrašo"; // messages/lt.json companySetup.statusInvalidCountry (prefix)

  // (1) company setup — the SELECT over every ISO country; save draft; read back the mirror
  const companySetup = async (code) => {
    await o.goto(HOST + `/${UI_LOCALE}/dashboard/start/company`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("company-setup-form").waitFor({ timeout: 60000 });
    const sel = o.getByTestId("company-setup-country");
    const options = await sel.locator("option").evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
    const listed = options.includes(code);
    const disabled = await sel.isDisabled().catch(() => false);
    const before = await sel.inputValue().catch(() => null);
    if (disabled) { mark(code, "company", false, { reason: "country_locked_verified", listed, optionCount: options.length, before }); await shot(o, `${code}-1-company-locked`); return; }
    if (!listed) { mark(code, "company", false, { reason: "option_missing_in_select", optionCount: options.length, before }); await shot(o, `${code}-1-company-option-missing`); return; }
    await sel.selectOption(code);
    await shot(o, `${code}-1-company-form`);
    await o.getByTestId("company-setup-save-draft").click();
    await o.getByTestId("company-setup-result").waitFor({ timeout: 60000 });
    const result = (await o.getByTestId("company-setup-result").innerText()).replace(/\s+/g, " ").trim();
    const invalidCountry = result.startsWith(INVALID_COUNTRY_TEXT);
    await shot(o, `${code}-1-company-saved`);
    const companies = (await companiesOf()).rows;
    const orgs = companies.length ? (await orgsOf(companies.map((c) => c.id))).rows : [];
    const companyOk = companies.length > 0 && companies.every((c) => c.country === code);
    const orgOk = orgs.length > 0 && orgs.every((x) => x.country === code);
    mark(code, "company", !invalidCountry && companyOk && orgOk, { optionCount: options.length, before, result, invalidCountry, companies: companies.map((c) => ({ id: c.id, country: c.country })), organizations: orgs.map((x) => ({ id: x.id, country: x.country })), readback: { companiesCountry: companyOk, organizationsCountry: orgOk } });
  };

  // (2) work card — country NAMES typed in the UI locale; the row must hold CODES
  const workCard = async (code) => {
    const locationName = nameOf(code);
    const preferredNames = CODES.map((c) => nameOf(c));
    await w.goto(HOST + `/${UI_LOCALE}/dashboard?result=player-card`, { waitUntil: "domcontentloaded", timeout: 60000 });
    let editorHost = w.getByTestId("player-card-work-editor");
    const onResult = await editorHost.waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    if (!onResult) {
      await w.goto(HOST + `/${UI_LOCALE}/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
      editorHost = w.locator("body");
    }
    const toggle = editorHost.getByTestId("work-card-editor-toggle").first();
    await toggle.waitFor({ timeout: 60000 });
    if ((await editorHost.getByTestId("work-card-editor").count()) === 0) await toggle.click();
    const form = editorHost.getByTestId("work-card-editor").first();
    await form.waitFor({ timeout: 30000 });
    await form.locator('input[name="location_country"]').fill(locationName);
    await form.locator('input[name="preferred_countries"]').fill(preferredNames.join(", "));
    await shot(w, `${code}-2-workcard-form`);
    await form.locator('button[type="submit"]').first().click();
    let status = null, tone = null;
    for (let i = 0; i < 20; i++) { await w.waitForTimeout(1500); const s = form.locator('[role="status"]').first(); if ((await s.count()) > 0) { status = (await s.innerText()).trim(); tone = /text-state-danger/.test((await s.getAttribute("class")) || "") ? "danger" : "success"; break; } }
    await shot(w, `${code}-2-workcard-saved`);
    const row = (await workerRow()).rows[0] || null;
    const locationOk = Boolean(row && row.current_location_country === code);
    const preferred = row && Array.isArray(row.preferred_countries) ? row.preferred_countries : null;
    const preferredOk = Boolean(preferred && CODES.every((c) => preferred.includes(c)) && preferred.every((c) => CODES.includes(c)));
    mark(code, "workCard", tone === "success" && locationOk && preferredOk, { typed: { location_country: locationName, preferred_countries: preferredNames.join(", ") }, status, tone, onResultRoute: onResult, row: row ? { id: row.id, current_location_country: row.current_location_country, preferred_countries: preferred } : null, readback: { locationCode: locationOk, preferredCodes: preferredOk } });
  };

  // (3) demand DRAFT — the criteria-step country listbox; save AS DRAFT only; read back the column
  const demandDraft = async (code) => {
    const label = nameOf(code);
    await o.goto(HOST + `/${UI_LOCALE}/dashboard/company/needs`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const form = o.getByTestId("demand-form");
    const formOk = await form.waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
    if (!formOk) { await o.goto(HOST + `/${UI_LOCALE}/dashboard/company`, { waitUntil: "domcontentloaded", timeout: 60000 }); await form.waitFor({ timeout: 60000 }); }
    if ((await o.getByTestId("demand-back").count()) > 0) { await o.getByTestId("demand-back").click(); await o.waitForTimeout(500); }
    // CONTROLLED client form: a fill that lands before hydration leaves text in the DOM but not
    // in React state, and React's value tracker treats a re-fill of the SAME text as no change
    // (local stack 2026-09-22: 30 identical re-fills, [demand-next] never enabled). So wait for
    // network-idle and CLEAR before every retry.
    await o.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    const next = o.getByTestId("demand-next");
    let gateOpen = false;
    for (let attempt = 1; attempt <= 5 && !gateOpen; attempt++) {
      await o.getByTestId("demand-role").fill("");
      await o.getByTestId("demand-description").fill("");
      await o.getByTestId("demand-role").fill(DRAFT_ROLE);
      await o.getByTestId("demand-description").fill(DRAFT_DESCRIPTION);
      gateOpen = await next.isEnabled({ timeout: 5000 }).catch(() => false);
      if (!gateOpen) await o.waitForTimeout(3000);
    }
    if (!gateOpen) { mark(code, "draft", false, { reason: "description_gate_never_opened" }); await shot(o, `${code}-3-draft-gate-closed`); return; }
    await next.click();
    const listbox = o.getByTestId("demand-country-select");
    await listbox.waitFor({ timeout: 30000 });
    await listbox.click();
    const options = o.locator('ul[role="listbox"] li[role="option"] button');
    await options.first().waitFor({ timeout: 15000 });
    const labels = await options.allInnerTexts();
    const option = options.filter({ hasText: new RegExp("^\\s*" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(✓)?\\s*$") }).first();
    const listed = (await option.count()) > 0;
    if (!listed) { await o.keyboard.press("Escape"); mark(code, "draft", false, { reason: "option_missing_in_listbox", label, optionCount: labels.length, first: labels.slice(0, 12) }); await shot(o, `${code}-3-draft-option-missing`); return; }
    await option.click();
    const shown = (await listbox.innerText()).replace(/\s+/g, " ").trim();
    await shot(o, `${code}-3-draft-criteria`);
    // ONLY the draft button — never [demand-create]
    await o.getByTestId("demand-save-draft").click();
    const saved = await o.getByTestId("demand-draft-saved").waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
    const draftError = await o.getByTestId("demand-draft-error").innerText().catch(() => null);
    await shot(o, `${code}-3-draft-saved`);
    const row = (await draftRow()).rows[0] || null;
    const columnOk = Boolean(row && row.country === code);
    const payloadOk = Boolean(row && row.payload && row.payload.country === code);
    const submittedLeak = (await q("customer_requests", "id, status", { profile_id: managerIdentity.id, title: DRAFT_ROLE, status: "submitted" })).rows.length;
    mark(code, "draft", saved && !draftError && columnOk && payloadOk && submittedLeak === 0, { label, listboxShows: shown, optionCount: labels.length, saved, draftError, row: row ? { id: row.id, status: row.status, country: row.country, payloadCountry: row.payload ? row.payload.country : undefined, organization_id: row.organization_id } : null, readback: { customerRequestsCountry: columnOk, payloadCountry: payloadOk }, submittedRowsWithWalkTitle: submittedLeak });
  };

  // (4) onboarding select — observation; an onboarded identity is forwarded away (nothing is created to reach it)
  const onboardingSelect = async (code) => {
    const checks = [];
    for (const [tag, p] of [["manager", o], ["worker", w]]) {
      await p.goto(HOST + `/${UI_LOCALE}/onboarding`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.waitForTimeout(3000);
      const sel = p.locator('select[name="country"]');
      const reachable = /\/onboarding/.test(p.url()) && (await sel.count()) > 0;
      if (!reachable) { checks.push({ identity: tag, reachable: false, reason: "unreachable_onboarded", landed: p.url() }); continue; }
      const values = await sel.locator("option").evaluateAll((os) => os.map((x) => x.value).filter(Boolean));
      checks.push({ identity: tag, reachable: true, listed: values.includes(code), optionCount: values.length });
      await shot(p, `${code}-4-onboarding-${tag}`);
    }
    const reachable = checks.filter((c) => c.reachable);
    mark(code, "onboarding", reachable.length === 0 ? null : reachable.every((c) => c.listed), { checks, verdict: reachable.length === 0 ? "not_reachable_for_these_identities (observation only; the local spec tests/e2e/global-access-countries.spec.ts covers the select)" : undefined });
  };

  for (const code of CODES) {
    log({ step: "country_begin", code, name: nameOf(code), nameEn: nameOf(code, "en") });
    await leg(code, "company", o, () => companySetup(code));
    await leg(code, "workCard", w, () => workCard(code));
    await leg(code, "draft", o, () => demandDraft(code));
    await leg(code, "onboarding", o, () => onboardingSelect(code));
    const r = results[code] || {};
    log({ step: "country_end", code, company: r.company ? r.company.ok : null, workCard: r.workCard ? r.workCard.ok : null, draft: r.draft ? r.draft.ok : null, onboarding: r.onboarding ? r.onboarding.ok : null });
  }

  // ── restore the baselines through the SAME UI (company country, work card) — the draft row is CLOSED, never deleted ──
  const restore = { company: null, workCard: null, draft: null };
  if (process.env.WALK_RESTORE !== "0") {
    await leg("RESTORE", "company", o, async () => {
      const base = baseline.companies[0] && baseline.companies[0].country;
      if (!base) { restore.company = "no_baseline_country"; return; }
      await o.goto(HOST + `/${UI_LOCALE}/dashboard/start/company`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await o.getByTestId("company-setup-form").waitFor({ timeout: 60000 });
      await o.getByTestId("company-setup-country").selectOption(base);
      await o.getByTestId("company-setup-save-draft").click();
      await o.getByTestId("company-setup-result").waitFor({ timeout: 60000 });
      const companies = (await companiesOf()).rows;
      restore.company = { to: base, companies: companies.map((c) => ({ id: c.id, country: c.country })) };
    });
    await leg("RESTORE", "workCard", w, async () => {
      const base = baseline.worker;
      if (!base || (!base.current_location_country && !(base.preferred_countries || []).length)) { restore.workCard = "no_baseline_values (the editor cannot CLEAR a saved field — see work-card-editor.tsx keepOnlyHint; restore statement printed in the residue register)"; return; }
      await w.goto(HOST + `/${UI_LOCALE}/dashboard?result=player-card`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const host = w.getByTestId("player-card-work-editor"); await host.waitFor({ timeout: 45000 });
      if ((await host.getByTestId("work-card-editor").count()) === 0) await host.getByTestId("work-card-editor-toggle").first().click();
      const form = host.getByTestId("work-card-editor").first(); await form.waitFor({ timeout: 30000 });
      if (base.current_location_country) await form.locator('input[name="location_country"]').fill(base.current_location_country);
      if ((base.preferred_countries || []).length) await form.locator('input[name="preferred_countries"]').fill(base.preferred_countries.join(", "));
      await form.locator('button[type="submit"]').first().click();
      await w.waitForTimeout(4000);
      const row = (await workerRow()).rows[0] || null;
      restore.workCard = { to: { current_location_country: base.current_location_country, preferred_countries: base.preferred_countries }, row: row ? { current_location_country: row.current_location_country, preferred_countries: row.preferred_countries } : null };
    });
    // the ONE draft row this walk wrote (one draft per profile+kind — every country iteration upserted the same row):
    // closed (draft→closed is the owner-allowed transition, the same "remove draft" path the UI offers), never deleted.
    const row = (await draftRow()).rows[0] || null;
    if (row && row.title === DRAFT_ROLE) {
      const { error } = await admin.from("customer_requests").update({ status: "closed" }).eq("id", row.id).eq("status", "draft");
      restore.draft = { id: row.id, closed: !error, error: error ? error.message : null, note: baseline.draft ? "a PRE-EXISTING draft was overwritten by this walk (one draft per profile+kind) — its baseline payload is in L0_baseline; re-create by hand if needed" : "no pre-existing draft" };
    } else restore.draft = row ? { id: row.id, closed: false, note: "the current draft is not the walk's (title differs) — left as is" } : "no draft row";
  }
  await b.close();

  // ── residue register ──────────────────────────────────────────────────────────────────────────────────────────────
  const finishedAt = new Date().toISOString();
  const countriesPassed = CODES.filter((c) => { const r = results[c] || {}; return r.company && r.company.ok && r.workCard && r.workCard.ok && r.draft && r.draft.ok && (!r.onboarding || r.onboarding.ok !== false); });
  const countriesFailed = CODES.filter((c) => !countriesPassed.includes(c)).map((c) => { const r = results[c] || {}; return { code: c, legs: Object.fromEntries(["company", "workCard", "draft", "onboarding"].map((l) => [l, r[l] ? (r[l].ok === null ? "not_reachable" : r[l].ok ? "ok" : (r[l].reason || r[l].error || "failed")) : "not_run"])) }; });
  const companyIds = baseline.companies.map((c) => c.id), orgIds = baseline.organizations.map((x) => x.id);
  const residue = {
    step: "residue",
    runWindow: { startedAt, finishedAt, build: health.build, stamp: STAMP },
    identities: { manager: { email: MANAGER, profile_id: managerIdentity.id }, worker: { email: WORKER, profile_id: workerIdentity.id }, keep: true, note: "auth.users/profiles KEPT" },
    excludeFromPilotMetrics: { profile_ids: [managerIdentity.id, workerIdentity.id], organization_ids: orgIds, company_ids: companyIds, worker_ids: baseline.worker ? [baseline.worker.id] : [], window: [startedAt, finishedAt] },
    touched: {
      companies: companyIds.map((id) => ({ id, column: "country", baseline: (baseline.companies.find((c) => c.id === id) || {}).country })),
      organizations: orgIds.map((id) => ({ id, column: "country (mirror of companies.country)", baseline: (baseline.organizations.find((x) => x.id === id) || {}).country })),
      workers: baseline.worker ? [{ id: baseline.worker.id, columns: ["current_location_country", "preferred_countries", "work_card_confirmed_at"], baseline: { current_location_country: baseline.worker.current_location_country, preferred_countries: baseline.worker.preferred_countries, work_card_confirmed_at: baseline.worker.work_card_confirmed_at } }] : [],
      customer_requests: restore.draft && restore.draft.id ? [{ id: restore.draft.id, kind: "company_request", title: DRAFT_ROLE, status: restore.draft.closed ? "closed" : "draft", baselineDraft: baseline.draft ? { id: baseline.draft.id, country: baseline.draft.country, title: baseline.draft.title, payload: baseline.draft.payload } : null }] : [],
      pilot_events: "rows for the two profile_ids inside runWindow (funnel telemetry of the walk itself) — exclude by profile_id + window, never delete",
    },
    restore,
    restoreStatements: [
      ...companyIds.map((id) => `update companies set country = ${JSON.stringify((baseline.companies.find((c) => c.id === id) || {}).country ?? null).replace(/"/g, "'")} where id = '${id}'; -- organizations.country follows through the mirror trigger`),
      ...(baseline.worker ? [`update workers set current_location_country = ${baseline.worker.current_location_country ? `'${baseline.worker.current_location_country}'` : "null"}, preferred_countries = ${baseline.worker.preferred_countries ? `'{${baseline.worker.preferred_countries.join(",")}}'` : "null"}, work_card_confirmed_at = ${baseline.worker.work_card_confirmed_at ? `'${baseline.worker.work_card_confirmed_at}'` : "null"} where id = '${baseline.worker.id}'`] : []),
      ...(restore.draft && restore.draft.id ? [`update customer_requests set status = 'closed' where id = '${restore.draft.id}' and status = 'draft'`] : []),
    ],
    deleteOrder: "nothing to DELETE: this walk creates at most ONE customer_requests row (the draft, upserted per country, CLOSED at the end) and UPDATES existing companies / organizations / workers columns (restored above). If the draft row must go: customer_requests (id above) → nothing else references it. KEEP auth.users + profiles + pilot_events.",
    inspect: [
      `select id, legal_name, country, verification_status from companies where profile_id = '${managerIdentity.id}'`,
      `select id, country, legacy_company_id from organizations where legacy_company_id in (${companyIds.map((id) => `'${id}'`).join(",") || "null"})`,
      `select id, current_location_country, preferred_countries, work_card_confirmed_at from workers where profile_id = '${workerIdentity.id}'`,
      `select id, status, kind, country, title, organization_id, payload->>'country' payload_country, updated_at from customer_requests where profile_id = '${managerIdentity.id}' and title = '${DRAFT_ROLE}' order by updated_at desc`,
      `select event_name, count(*) from pilot_events where profile_id in ('${managerIdentity.id}','${workerIdentity.id}') and created_at between '${startedAt}' and '${finishedAt}' group by 1 order by 2 desc`,
    ],
  };
  log(residue);
  log({ step: "summary", countriesPassed, countriesFailed, evidence: { log: "stdout (one JSON line per step)", screenshots: OUT.replace(/\\/g, "/"), perCountry: CODES.map((c) => `${c}-1-company-*.png, ${c}-2-workcard-*.png, ${c}-3-draft-*.png, ${c}-4-onboarding-*.png (when reachable)`) }, totalMs: ms() });
  log({ step: "done", totalMs: ms(), readback: residue.inspect.join("; ") });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
