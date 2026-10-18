// PRODUCTION WALK — the sentences real people say reach the doors that already exist
// (real-user fitness review 2026-09-06, PR fix/cc/real-people-doors).
//
// WHAT IT PROVES against production, read-only, with bounded E2E identities:
//   1. PERSON (an employer nowhere): "reikia santechniko" → the service-request door AND the
//      company-setup door are offered (was: the not-understood menu).
//   2. PERSON: "noriu siūlyti buhalterijos paslaugas" → understood as an OFFERED SERVICE, the
//      services door offered, and NO "Slaugos pagalbininkas" claim (was: a false occupation claim).
//   3. PERSON: "galiu kirpti plaukus namuose" → the services door (was: the not-understood menu).
//   4. COMPANY workspace: "ką man daryti toliau?" → the COMPANY's next step, never the person's
//      profile ladder (was: "Profesija · Prieinamumas · Darbo kortelė").
//   5. WORKER with two countries: "kas man trūksta?" → no document name repeated (was: a stutter).
//
// Read-only: no form is submitted, no row is created by hand. The chat's own telemetry rows
// (pilot_events) are the same residue every prior walk left.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-real-people-doors-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const HOST = "https://labourmarket.ai";

const PERSON = "e2e-spine-person-202609051508@labourmarket.ai"; // personal space, employer nowhere
const COMPANY = "e2e-walker-202609021438@labourmarket.ai";      // acts for E2E Walker UAB
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";      // two country preferences (NO, SE)

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-real-people-doors"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };

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
    await p.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await p.waitForTimeout(2000);
    return { c, p, failed };
  };
  const ask = async (p, sentence, maxMs = 45000) => {
    const thread = p.getByTestId("conversation-thread");
    const before = (await thread.innerText()).length;
    await p.getByTestId("composer-input").fill(sentence); await p.getByTestId("composer-input").press("Enter");
    const t = Date.now(); let text = "";
    while (Date.now() - t < maxMs) {
      await p.waitForTimeout(1500);
      const typing = await p.getByTestId("chat-typing").count();
      const full = await thread.innerText();
      // Slice from where the thread ENDED before the sentence — a starter chip
      // carrying the same words after the answer must not empty the capture.
      // The user bubble is NOT inside the thread node, so the new tail IS the answer.
      if (!typing && full.length > before + 20) { text = full.slice(before); break; }
    }
    const chips = await thread.locator("button").allInnerTexts().catch(() => []);
    return { text: text.replace(/\s+/g, " ").trim(), chips: chips.slice(-6) };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true }).catch(() => {});

  // ── 1–3. PERSON ────────────────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(PERSON, { width: 390, height: 844 });
    // A COUNTED trade is deterministic need-workers (seek verb + occupation stem,
    // score 6); the bare "reikia santechniko" is low-weight and the Gemini
    // proposer may route it elsewhere between runs — a walk must not depend on that.
    const a = await ask(p, "reikia dviejų santechnikų");
    log({ leg: "person_trade_need", ...a });
    must("person 'reikia santechniko' offers the service-request door", a.chips.some((x) => /paslaug/i.test(x)), a.chips);
    must("person 'reikia santechniko' offers the company-setup door", a.chips.some((x) => /įmon|organizacij/i.test(x)), a.chips);
    must("person 'reikia santechniko' is not the not-understood menu", !/Galiu padėti su CV, profiliu/i.test(a.text), a.text.slice(0, 160));
    await shot(p, "01-person-trade-need");

    const b2 = await ask(p, "noriu siūlyti buhalterijos paslaugas");
    log({ leg: "person_offer_service_noun", ...b2 });
    // The correct answer itself says "paslaugos" — only the OCCUPATION claim is the defect.
    must("no false 'Slaugos pagalbininkas' claim", !/slaugos pagalbinink|slaugytoj/i.test(b2.text), b2.text.slice(0, 200));
    must("offered service reaches the services door", b2.chips.some((x) => /paslaug/i.test(x)) || /paslaug/i.test(b2.text), b2.chips);
    must("not the 'not sure whether offering or seeking' line", !/Nesu tikras/i.test(b2.text), b2.text.slice(0, 160));
    await shot(p, "02-person-offer-noun");

    const b3 = await ask(p, "galiu kirpti plaukus namuose");
    log({ leg: "person_offer_activity", ...b3 });
    must("'galiu kirpti plaukus' reaches the services door", b3.chips.some((x) => /paslaug/i.test(x)), b3.chips);
    must("'galiu kirpti plaukus' is not the not-understood menu", !/Nesu tikras|Galiu padėti su CV/i.test(b3.text), b3.text.slice(0, 160));
    await shot(p, "03-person-offer-activity");
    log({ leg: "person_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── 4. COMPANY ─────────────────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(COMPANY, { width: 1280, height: 800 });
    const a = await ask(p, "ką man daryti toliau?");
    log({ leg: "company_next_step", ...a });
    must("company 'ką man daryti toliau?' is NOT the person's profile ladder", !/Profesija|Prieinamumas|Darbo kortelė|esminių dalių/i.test(a.text), a.text.slice(0, 200));
    must("company 'ką man daryti toliau?' answers with the company's own lines or the hub door", a.text.length > 10, a.text.slice(0, 200));
    await shot(p, "04-company-next-step");
    log({ leg: "company_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  // ── 5. WORKER ──────────────────────────────────────────────────────────────
  {
    const { c, p, failed } = await open(WORKER, { width: 390, height: 844 });
    const a = await ask(p, "kas man trūksta?");
    log({ leg: "worker_documents_gap", ...a });
    const m = a.text.match(/Dokumentai: trūksta \d+ \(([^)]*\([^)]*\))*[^)]*\)/);
    const list = m ? m[0] : "";
    const names = list.replace(/\([A-Z]{2}(, [A-Z]{2})*\)/g, "").split(/[(),]/).map((s) => s.trim()).filter((s) => s && !/^Dokumentai|^trūksta/.test(s));
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    must("no document name is repeated in the gap line", list.length > 0 && dupes.length === 0, { list, dupes });
    await shot(p, "05-worker-documents-gap");
    log({ leg: "worker_failed_requests", failed: failed.slice(0, 5) });
    await c.close();
  }

  await b.close();
  log({ result: fail.length === 0 ? "PASS" : "FAIL", failed: fail });
  process.exit(fail.length === 0 ? 0 : 1);
})();
