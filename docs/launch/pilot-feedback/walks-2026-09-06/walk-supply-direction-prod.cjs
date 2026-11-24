// PRODUCTION WALK — THE SUPPLY DIRECTION IS READ BACK AS SUPPLY
// (owner window 7 §4/§6, 2026-09-06).
//
// #1587 gave the agency sentence a door: "Turime 20 suvirintojų ir ieškome
// jiems darbo" now lands as a `customer_requests` row with `kind =
// 'agency_offer'` instead of being read as one person hunting for a job.
//
// What it did NOT give it was a way back. Measured on production the same day:
// `listOwnCustomerRequests` never selected `kind`, so the company dashboard
// listed that OFFER under "what you asked for", with a scouting link that
// answers "who could fill this need" — and `loadCanonicalDemand` mapped it to
// canonical demand with `actionable: true`. The agency stated capacity and the
// product answered as if it had stated a need.
//
// This walk does the whole journey as a person, in ONE live session, and then
// removes what it wrote:
//
//   S1  what the identity owns BEFORE (own rows, read as the person)
//   S2  say the supply sentence → the OFFER form opens → continue → save
//   S3  open the company dashboard and READ IT BACK:
//         · the offer appears under the SUPPLY section
//         · it does NOT appear among the needs
//         · no scouting link over a row scouting cannot describe
//         · no raw translation key anywhere on the screen
//   S4  the row is deleted and the deletion verified — zero residue
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-supply-direction-prod.cjs
//   MEASURE_ONLY=1  → log everything, never fail (the BEFORE run).
//   KEEP=1          → skip S4 (leave the row; use only when debugging).
//
// WRITES ONE ROW. That is the point — a read-only walk cannot prove a readback.
// The row is created by the identity itself through the real UI and removed in
// S4 by id.
//
// S4 CANNOT COMPLETE ON ITS OWN, and says so instead of pretending. Measured
// 2026-09-06: `customer_requests_delete` is `is_admin()`, and the service-role
// connection is refused outright ("permission denied for table
// customer_requests") because the table's default privileges were revoked —
// the same class that left the notification emitters dead since July (#1566).
// So S4 FAILS and logs the exact one-line statement to run through the
// privileged path. A run of this walk is not finished until that line has been
// executed and the row is gone.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const COMPANY = "e2e-walker-202609021438@labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const MEASURE_ONLY = process.env.MEASURE_ONLY === "1";
const KEEP = process.env.KEEP === "1";
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-supply-direction"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const check = (name, ok, detail) => {
  log({ check: name, ok: !!ok, detail });
  if (!ok && !MEASURE_ONLY) fail.push(name);
};

// A next-intl catalogue resolves a MISSING key to the key itself and does not
// throw, so the only thing that ever sees it is a screen. Any dotted
// identifier-looking run of text is treated as a leak.
const RAW_KEY = /\b(?:demandReadback|conversation|roleDashboards|workspace)\.[a-zA-Z]+\.[a-zA-Z.]+\b/;

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
  // Own rows are read AS THE PERSON — the way the product reads them — so the
  // walk cannot pass on a privilege the dashboard does not have.
  const asUser = async (email) => {
    const sess = await mintSession(email);
    return createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${sess.access_token}` } },
    });
  };
  const ownRequests = async (email) => {
    const me = await asUser(email);
    const { data, error } = await me
      .from("customer_requests")
      .select("id, kind, status, title, role_or_work_type, team_size, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) { log({ step: "ownRequests", error: error.message }); return null; }
    return data;
  };

  // ── S1 — what this identity owns BEFORE ──────────────────────────────────
  const before = await ownRequests(COMPANY);
  check("S1 own rows readable as the person", Array.isArray(before), before && before.length);
  const beforeIds = new Set((before || []).map((r) => r.id));
  const beforeOffers = (before || []).filter((r) => r.kind === "agency_offer").length;
  log({ step: "S1", total: (before || []).length, agency_offer: beforeOffers });

  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 1400 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(COMPANY), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage();
  const failed = []; p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
  const shot = (n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});

  // ── S2 — say it, and finish the form the way a person would ──────────────
  await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
  // The opening brief races the first sentence of a session (window-6 trap):
  // let it land before typing, or turn 1 is measured mid-write.
  await p.waitForTimeout(8000);

  const SENTENCE = "Turime 20 suvirintojų, kuriems ieškome darbo Nyderlanduose.";
  await p.getByTestId("composer-input").fill(SENTENCE);
  await p.getByTestId("composer-input").press("Enter");
  await p.getByTestId("field-role").first().waitFor({ timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(3000);
  await shot("S2-form");

  const formOpen = (await p.getByTestId("field-role").count()) > 0;
  const roleValue = formOpen ? await p.getByTestId("field-role").last().inputValue().catch(() => null) : null;
  const sizeValue = formOpen ? await p.getByTestId("field-teamSize").last().inputValue().catch(() => null) : null;
  check("S2 the OFFER form opened, carrying the trade and the count", formOpen && /suvirintoj/i.test(roleValue || "") && String(sizeValue || "") === "20", { roleValue, sizeValue });
  if (!formOpen) {
    log({ step: "S2", abort: "no form — cannot prove a readback without a row" });
    if (!MEASURE_ONLY) fail.push("S2 the OFFER form opened, carrying the trade and the count");
    await c.close(); await b.close();
    log({ result: fail.length ? "FAIL" : "PASS", failed: fail });
    process.exit(fail.length ? 1 : 0);
  }

  // A description is what the write path requires; give it the person's own
  // sentence rather than invented text.
  const desc = p.getByTestId("field-description").last();
  if (await desc.count()) {
    const current = await desc.inputValue().catch(() => "");
    if (!current || !current.trim()) await desc.fill(SENTENCE);
  }
  await p.getByTestId("inline-action-continue").last().click();
  await p.getByTestId("inline-action-review").last().waitFor({ timeout: 30000 });
  await shot("S2-review");
  await p.getByTestId("inline-action-save").last().click();
  await p.getByTestId("inline-action-done").last().waitFor({ timeout: 60000 }).catch(() => {});
  const saved = (await p.getByTestId("inline-action-done").count()) > 0;
  const formError = (await p.getByTestId("inline-action-error").count()) > 0
    ? await p.getByTestId("inline-action-error").last().innerText().catch(() => "")
    : null;
  await shot("S2-saved");
  check("S2 the offer was saved and said so", saved, { formError });

  // MEASURED ON PRODUCTION 2026-09-06, BEFORE ANY OF THIS SHIPPED: the save is
  // refused with "nemokamas planas leidžia 1 aktyvią poziciją" — the employer
  // open-needs ceiling counted the agency's OFFER as one of its active NEEDS,
  // so an organisation holding one open need could not state its capacity at
  // all. That is a separate, owner-gated fix (`lib/billing/open-needs-gate.ts`
  // is billing → RED class). It is NOT this walk's subject, and it must not be
  // allowed to hide the subject.
  //
  // So when the human save is refused for that reason, the walk writes the
  // SAME canonical row the UI would have written — `submit_demand_request_v2`,
  // called AS THE PERSON, under their own RLS, with the values the form
  // carried — and says loudly that it did. Every read assertion below then
  // runs against a row of the real shape. The write leg's own human proof is
  // the form above: it opened, in the supply direction, carrying the trade and
  // the count. When the gate fix lands, this fallback stops firing.
  let seeded = false;
  if (!saved) {
    const blockedByQuota = /aktyvi|plan|99/i.test(formError || "");
    check("S2 the refusal is the known open-needs ceiling, not something new", blockedByQuota, formError);
    if (blockedByQuota) {
      const me = await asUser(COMPANY);
      const { error: rpcErr } = await me.rpc("submit_demand_request_v2", {
        p_kind: "agency_offer",
        p_title: roleValue || "Agency partnership — offer",
        p_need_summary: SENTENCE,
        p_payload: { source: "walk_supply_direction", intent: "partner", role: roleValue, location: "Nyderlandai" },
        p_original_language: "lt",
        p_organization_id: null,
      });
      seeded = !rpcErr;
      log({ step: "S2 seed", seeded, error: rpcErr && rpcErr.message });
      check("S2 the canonical supply row exists to be read back", seeded, rpcErr && rpcErr.message);
    }
  }
  log({ step: "S2 write path", human: saved, seededThroughRpc: seeded });

  // What actually landed in the store, read as the person.
  const after = await ownRequests(COMPANY);
  const created = (after || []).filter((r) => !beforeIds.has(r.id));
  log({ step: "S2 persisted", created });
  check("S2 exactly one new row was written", created.length === 1, created.map((r) => ({ id: r.id, kind: r.kind, status: r.status })));
  check("S2 the new row is SUPPLY, not demand", created.length === 1 && created[0].kind === "agency_offer", created[0] && created[0].kind);
  const newId = created.length === 1 ? created[0].id : null;

  // ── S3 — read it back on the surface a person actually opens ─────────────
  await p.goto(HOST + "/lt/dashboard/company", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("demand-requests-readback").waitFor({ timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(4000);
  await shot("S3-dashboard");

  const supplySection = p.getByTestId("supply-offers-readback");
  const supplyPresent = (await supplySection.count()) > 0;
  check("S3 the supply section exists", supplyPresent, null);

  if (supplyPresent) {
    await supplySection.first().scrollIntoViewIfNeeded().catch(() => {});
    await shot("S3-supply-section");
    const supplyRows = supplySection.first().getByTestId("demand-readback-row");
    const supplyCount = await supplyRows.count();
    const supplyDirections = [];
    for (let i = 0; i < supplyCount; i++) {
      supplyDirections.push(await supplyRows.nth(i).getAttribute("data-direction"));
    }
    check("S3 every row in the supply section IS supply", supplyCount > 0 && supplyDirections.every((d) => d === "supply"), supplyDirections);

    // Scouting answers "who could fill this need" — meaningless over an offer.
    const scoutInSupply = await supplySection.first().getByTestId("demand-readback-scout-link").count();
    check("S3 no scouting link over an offer", scoutInSupply === 0, scoutInSupply);

    const noteText = (await supplySection.first().getByTestId("supply-readback-note").innerText().catch(() => "")).trim();
    check("S3 the supply section states the honest gap in real words", noteText.length > 20 && !RAW_KEY.test(noteText), noteText.slice(0, 160));

    const headingText = (await supplySection.first().locator("h2").innerText().catch(() => "")).trim();
    check("S3 the supply heading is a real sentence, not a key", headingText.length > 3 && !RAW_KEY.test(headingText), headingText);
  }

  // THE DEFECT, stated directly: the offer must no longer sit among the needs.
  const needsSection = p.getByTestId("demand-requests-readback");
  const needsPresent = (await needsSection.count()) > 0;
  check("S3 the needs section still renders", needsPresent, null);
  if (needsPresent) {
    const needRows = needsSection.first().getByTestId("demand-readback-row");
    const n = await needRows.count();
    const needDirections = [];
    for (let i = 0; i < n; i++) needDirections.push(await needRows.nth(i).getAttribute("data-direction"));
    check("S3 NO supply row is listed among the needs", needDirections.every((d) => d === "demand"), needDirections);
  }

  // The whole screen, not just the new section — the raw-key class ships
  // silently and only a person ever sees it.
  const pageText = await p.locator("body").innerText().catch(() => "");
  const leak = pageText.match(RAW_KEY);
  check("S3 no raw translation key on the company dashboard", !leak, leak && leak[0]);
  check("S3 no failed requests", failed.length === 0, failed.slice(0, 5));

  await c.close();
  await b.close();

  // ── S4 — zero residue ────────────────────────────────────────────────────
  if (newId && !KEEP) {
    // MEASURED 2026-09-06: this delete returns "permission denied for table
    // customer_requests". `service_role` holds NO grant here — the revoked
    // default privileges (the same class that left the notification emitters
    // dead since July, #1566) — and `customer_requests_delete` is `is_admin()`,
    // which a service-role connection does not satisfy either. So the walk
    // CANNOT clean up after itself, and the check below fails loudly with the
    // exact statement to run rather than reporting a tidy zero.
    const { error: delErr } = await admin.from("customer_requests").delete().eq("id", newId);
    if (delErr) {
      log({
        step: "S4 MANUAL CLEANUP REQUIRED",
        reason: delErr.message,
        sql: `delete from public.customer_requests where id = '${newId}';`,
      });
    }
    const remaining = await ownRequests(COMPANY);
    const stillThere = (remaining || []).some((r) => r.id === newId);
    check("S4 the row this walk created is gone", !delErr && !stillThere, { delErr: delErr && delErr.message, newId });
    const endOffers = (remaining || []).filter((r) => r.kind === "agency_offer").length;
    check("S4 the identity is back to its starting shape", (remaining || []).length === (before || []).length && endOffers === beforeOffers, { before: (before || []).length, after: (remaining || []).length, beforeOffers, endOffers });
  } else if (newId) {
    log({ step: "S4", skipped: "KEEP=1", newId });
  }

  log({ result: fail.length ? "FAIL" : "PASS", failed: fail });
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { log({ fatal: String((e && e.stack) || e) }); process.exit(1); });
