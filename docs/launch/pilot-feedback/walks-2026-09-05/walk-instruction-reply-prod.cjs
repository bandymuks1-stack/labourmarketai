/**
 * walk-instruction-reply-prod.cjs — I3 gap link 5–6: the person answers the manager's instruction (clarify request
 * from the instructions page) and the MANAGER sees that reply on the readiness line + in the thread.
 * Uses the KEPT spine identities and the instruction created by rewalk-spine-gaps-prod.cjs (conversation 3de3c080…).
 * Usage: EXPECT_BUILD=<sha7> node walk-instruction-reply-prod.cjs
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
const OUT = path.join(__dirname, "walk-instruction-reply"); fs.mkdirSync(OUT, { recursive: true });
const HOST = "https://labourmarket.ai";
const ORG_EMAIL = "e2e-spine-org-202609051508@labourmarket.ai";
const PERSON_EMAIL = "e2e-spine-person-202609051508@labourmarket.ai";
const ORG_ID = "03e1861f-7dda-4372-9e90-e4eac7928772";
const PERSON_ID = "70851a66-168c-443c-bb7b-d6f4d5112cd6";
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
  const leg = async (name, p, fn) => { try { await fn(); } catch (e) { log({ step: "leg_failed", leg: name, ms: ms(), error: e && e.message ? e.message.slice(0, 400) : String(e) }); if (p) await shot(p, "99-failed-" + name); } };

  // ═══ P — the person asks for clarification from the instructions page ═════════════════════════════════════════════
  const wc = await contextFor(PERSON_EMAIL, { width: 390, height: 844 }, "light");
  const w = await wc.newPage();
  let threadHref = null, clarified = false;
  await leg("P_person_clarify", w, async () => {
    await w.goto(HOST + "/lt/dashboard/instructions", { waitUntil: "domcontentloaded", timeout: 60000 });
    await w.getByTestId("worker-instruction-card").first().waitFor({ timeout: 60000 });
    const card = w.getByTestId("worker-instruction-card").first();
    const cardText = (await card.innerText()).replace(/\s+/g, " ");
    const btn = card.getByTestId("instruction-clarify");
    const labelBefore = await btn.innerText();
    await btn.click();
    await w.waitForTimeout(8000);
    const labelAfter = await btn.innerText().catch(() => null);
    const link = card.getByTestId("instruction-clarify-thread-link");
    clarified = (await link.count()) > 0;
    threadHref = clarified ? await link.getAttribute("href") : null;
    const err = (await card.getByTestId("instruction-clarify-error").count()) > 0;
    log({ step: "P_person_clarify", ms: ms(), cardExcerpt: cardText.slice(0, 300), labelBefore, labelAfter, clarified, threadHref, error: err });
    await shot(w, "P-person-clarified");
    if (threadHref) {
      await w.goto(HOST + (threadHref.startsWith("/lt") ? threadHref : "/lt" + threadHref), { waitUntil: "domcontentloaded", timeout: 60000 });
      await w.waitForTimeout(6000);
      const t = await body(w);
      log({ step: "P_person_thread", url: w.url(), hasInstruction: /prašome pateikti/i.test(t), hasClarify: /patikslin/i.test(t), excerpt: t.slice(0, 500) });
      await shot(w, "P-person-thread");
    }
  });
  // ═══ M — the manager sees the reply (readiness line + thread) ═══════════════════════════════════════════════════════
  const oc = await contextFor(ORG_EMAIL, { width: 1280, height: 900 }, "dark");
  const o = await oc.newPage();
  await leg("M_org_sees_reply", o, async () => {
    await o.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await o.waitForTimeout(6000);
    const t = await ask(o, `kas trūksta projektui ${PROJECT}?`, 60000);
    const personLine = (t.match(new RegExp("• " + esc(PERSON_NAME) + "[^•]{0,300}")) || [null])[0];
    log({ step: "M_org_readiness_line", ms: ms(), personLine, replied: /atsakė/.test(personLine || ""), excerpt: t.slice(0, 600) });
    await shot(o, "M-org-readiness");
    if (threadHref) {
      const p = threadHref.replace(/^\/lt/, "");
      await o.goto(HOST + "/lt" + p, { waitUntil: "domcontentloaded", timeout: 60000 });
      await o.waitForTimeout(6000);
      const tt = await body(o);
      log({ step: "M_org_thread", url: o.url(), replyVisible: /patikslin/i.test(tt), personNamed: tt.includes(PERSON_NAME), excerpt: tt.slice(0, 500) });
      await shot(o, "M-org-thread");
    }
    await o.goto(HOST + "/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
    await o.getByTestId("composer-input").waitFor({ timeout: 90000 });
    await o.waitForTimeout(9000);
    const brief = await body(o);
    log({ step: "M_org_brief", repliesLine: (brief.match(/[^.]*(atsakė|atsakym)[^.]*\./) || [null])[0], excerpt: brief.slice(0, 400) });
    await shot(o, "M-org-brief");
  });
  await b.close();
  log({ step: "residue", identities: { org: ORG_EMAIL, person: PERSON_EMAIL, keep: true }, created: { clarified, threadHref, since: startedAt },
    inspect: [`select id, conversation_id, author_id, is_instruction, left(body,80) body, created_at from conversation_messages where author_id in ('${ORG_ID}','${PERSON_ID}') and created_at >= '${startedAt}' order by created_at`] });
  log({ step: "done", totalMs: ms() });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
