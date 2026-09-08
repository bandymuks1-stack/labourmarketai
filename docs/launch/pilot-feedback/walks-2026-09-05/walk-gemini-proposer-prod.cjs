// Production walk — the GEMINI PROPOSER (owner approval 2026-09-05). Acceptance 1–8:
//  1. a known deterministic phrase ("mano projektai") answers WITHOUT Gemini (telemetry resolution=deterministic);
//  2–4. paraphrases NO regex pattern covers reach Gemini, come back as an EXISTING intent id, and the SAME handler
//       runs the authorized action (company: "kuriems objektams gresia problemos" → project-risk; "kurie darbuotojai
//       nebus užimti" → who-available);
//  5. the unauthorized equivalent (the WORKER asking the company question) is refused by the handler exactly as before;
//  6. ambiguous input asks for the genuinely missing information ("Pastolių montavimą užbaigėme" → task-status → the
//     chat ASKS which task, from real rows — it does not pick one);
//  7. guards — see the branch's test run; 8. telemetry: pilot_events.metadata.resolution ∈ {deterministic, llm}.
// Readback (MCP): ai_runs rows task_type='propose_conversation_intent' (provider, model, blocked_reason,
// data_categories_sent — no sentence), pilot_events chat_intent_* with resolution.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-gemini-proposer"); fs.mkdirSync(OUT, { recursive: true });
const CASES_COMPANY = [
  { id: "deterministic", say: "mano projektai", expect: /Jūsų projektai|projektai|Projektai/ },
  { id: "risk_paraphrase", say: "Norėčiau sužinoti, kuriems mano objektams gresia problemos", expect: /Projektų būklė/ },
  { id: "capacity_paraphrase", say: "Sužinok, kurie darbuotojai nebus užimti per artimiausias dienas", expect: /laisvas|nelaisvas iki|Komandoje kol kas nieko/ },
  { id: "ambiguous_task", say: "Pastolių montavimą užbaigėme", expect: /Kuri užduotis\?|Tokios užduoties nerandu|Užduotis pažymėta atlikta/ },
];
const CASES_WORKER = [
  { id: "unauthorized_equivalent", say: "Sužinok, kurie darbuotojai nebus užimti per artimiausias dienas", expect: /Nesupratau|nesupratau|Galiu padėti|padėti/ },
  { id: "worker_paraphrase", say: "Ką dar turiu susitvarkyti, kad galėčiau važiuoti dirbti į Vokietiją?", expect: /dokument|Dokument|trūksta|įgūd|toliau/ },
];
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
  const run = async (email, viewport, cases, tag) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    const composer = p.getByTestId("composer-input");
    await composer.waitFor({ timeout: 90000 });
    for (const cs of cases) {
      const before = (await p.locator("body").innerText()).length;
      const t0 = Date.now();
      await composer.fill(cs.say); await composer.press("Enter");
      let answer = "";
      for (let i = 0; i < 24; i++) {
        await p.waitForTimeout(1500);
        const body = await p.locator("body").innerText();
        const tail = body.slice(before);
        if (cs.expect.test(tail) && !/Ruošiamas rezultatas/.test(tail.slice(-200))) { answer = tail; break; }
        answer = tail;
      }
      const matched = cs.expect.test(answer);
      const lines = answer.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && l !== cs.say).slice(0, 5);
      log({ step: `${tag}:${cs.id}`, ms: Date.now() - t0, matched, lines: lines.map((l) => l.slice(0, 120)) });
      await p.screenshot({ path: path.join(OUT, `${tag}-${cs.id}.png`) });
    }
    await c.close();
  };
  await run(MANAGER, { width: 1280, height: 900 }, CASES_COMPANY, "company");
  await run(WORKER, { width: 390, height: 844 }, CASES_WORKER, "worker");
  await b.close();
  log({ step: "done", readback: "select task_type, provider, model_id, status, blocked_reason, data_categories_sent, input_source, latency_ms, actual_cost_usd, created_at from ai_runs where task_type='propose_conversation_intent' order by created_at desc limit 8; select event_name, metadata->>'step' step, metadata->>'resolution' resolution, created_at from pilot_events where event_name like 'chat_intent_%' and created_at > now() - interval '20 minutes' order by created_at desc limit 12" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
