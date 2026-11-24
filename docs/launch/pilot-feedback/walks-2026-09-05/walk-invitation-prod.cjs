// Production walk — INVITATION → the person's Attention → accept in the chat over the ONE dispatcher (#1522, dec7877d).
//  1. manager (E2E Walker UAB) creates a canonical `join_organization` invitation for E2E Worker Two through the
//     existing server path (the network page's own RPC `create_invitation_v1` via the admin session is NOT used —
//     we drive the UI: /lt/dashboard/network → invite form) — if the form cannot be driven, the walk logs
//     `invite_ui_unreachable` and stops honestly;
//  2. the worker's opening brief carries "E2E Walker UAB kviečia jus (1 kvietimas)." + chip "Kvietimai";
//  3. "mano kvietimai" → "Jums adresuoti kvietimai: 1." + card → accept → confirm → done(outcome=accepted);
//  4. MCP readback (printed): invitations.status='accepted', engagement_contexts employee row, audit_logs, pilot_events;
//  5. worker reload → no brief line; "mano kvietimai" → empty; 6. manager network page → accepted.
// Residue: the invitation row (accepted) + the engagement row — DELETE via MCP afterwards (E2E data); see `readback`.
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const MANAGER = "e2e-walker-202609021438@labourmarket.ai";
const WORKER = "e2e-worker2-202609021527@labourmarket.ai";
const ORG = "E2E Walker UAB";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8");
const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-invitation"); fs.mkdirSync(OUT, { recursive: true });
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
  const open = async (email, viewport, pathname) => {
    const c = await b.newContext({ viewport, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: await session(email), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage();
    await p.goto("https://labourmarket.ai" + pathname, { waitUntil: "domcontentloaded", timeout: 60000 });
    return p;
  };
  const say = async (p, s, re, max = 20) => {
    await p.getByTestId("composer-input").fill(s); await p.getByTestId("composer-input").press("Enter");
    let body = "";
    for (let i = 0; i < max; i++) { await p.waitForTimeout(1500); body = await p.locator("body").innerText(); if (re.test(body)) break; }
    return body;
  };
  const t0 = Date.now();

  // 1. manager invites through the network page UI
  const m = await open(MANAGER, { width: 1280, height: 900 }, "/lt/dashboard/network");
  await m.waitForTimeout(6000);
  await m.screenshot({ path: path.join(OUT, "01-manager-network.png") });
  let invited = false;
  const openBtn = m.getByTestId("invite-panel-open");
  if ((await openBtn.count()) > 0) {
    await openBtn.click(); await m.waitForTimeout(2000);
    await m.getByTestId("invite-type").selectOption("join_organization"); await m.waitForTimeout(800);
    const orgSel = m.getByTestId("invite-organization");
    if ((await orgSel.count()) > 0) { await orgSel.selectOption({ label: ORG }); await m.waitForTimeout(500); }
    const capSel = m.getByTestId("invite-capacity");
    if ((await capSel.count()) > 0) { await capSel.selectOption("employee"); await m.waitForTimeout(500); }
    await m.getByTestId("invite-emails").fill(WORKER);
    await m.getByTestId("invite-submit").click();
    for (let i = 0; i < 20; i++) { await m.waitForTimeout(1500); if ((await m.locator('[data-testid^="invite-result-"]').count()) > 0) break; }
    const outcomes = await m.locator('[data-testid^="invite-result-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    log({ step: "M1_outcomes", outcomes });
    invited = outcomes.some((o) => /created|sent/.test(o || ""));
  }
  const mbody = await m.locator("body").innerText();
  log({ step: "M1_invite", invited, said: (mbody.match(/[^\n]*(išsiųst|sukurt|pakviest|laukia)[^\n]*/i) || [null])[0] });
  await m.screenshot({ path: path.join(OUT, "02-manager-invited.png") });
  if (!invited) { log({ step: "invite_ui_unreachable" }); await b.close(); process.exit(3); }

  // 2. the worker's brief
  const w = await open(WORKER, { width: 390, height: 844 }, "/lt/dashboard");
  await w.getByTestId("composer-input").waitFor({ timeout: 90000 });
  await w.waitForTimeout(9000);
  const brief = await w.locator("body").innerText();
  log({ step: "W1_brief", ms: Date.now() - t0, line: (brief.match(/[^\n]*kviečia jus[^\n]*/) || [null])[0], chip: (await w.getByRole("button", { name: /^Kvietimai/ }).count()) > 0 });
  await w.screenshot({ path: path.join(OUT, "03-worker-brief.png") });

  // 3. "mano kvietimai" → card → accept → confirm → done
  const list = await say(w, "mano kvietimai", /Jums adresuoti kvietimai|kvietimų nėra/);
  log({ step: "W2_list", line: (list.match(/Jums adresuoti kvietimai[^\n]*|[^\n]*kvietimų nėra[^\n]*/) || [null])[0], card: (await w.getByTestId("conversation-invitation-action").count()) });
  await w.screenshot({ path: path.join(OUT, "04-worker-list.png") });
  const accept = w.getByTestId("conversation-invitation-accept").first();
  if ((await accept.count()) === 0) { log({ step: "no_accept_button" }); await b.close(); process.exit(4); }
  await accept.click(); await w.waitForTimeout(2500);
  await w.getByTestId("conversation-invitation-confirm").first().click();
  await w.getByTestId("conversation-invitation-done").first().waitFor({ timeout: 40000 });
  const outcome = await w.getByTestId("conversation-invitation-done").first().getAttribute("data-outcome");
  log({ step: "W3_accepted", ms: Date.now() - t0, outcome });
  await w.screenshot({ path: path.join(OUT, "05-worker-accepted.png") });

  // 5. worker reload → no brief line; list empty
  await w.reload({ waitUntil: "domcontentloaded" }); await w.getByTestId("composer-input").waitFor({ timeout: 90000 }); await w.waitForTimeout(9000);
  const brief2 = await w.locator("body").innerText();
  const list2 = await say(w, "mano kvietimai", /kvietimų nėra|Jums adresuoti kvietimai/);
  log({ step: "W4_after", briefLine: (brief2.match(/[^\n]*kviečia jus[^\n]*/) || [null])[0], listLine: (list2.match(/[^\n]*kvietimų nėra[^\n]*|Jums adresuoti kvietimai[^\n]*/) || [null])[0] });

  // 6. manager sees accepted
  await m.reload({ waitUntil: "domcontentloaded" }); await m.waitForTimeout(8000);
  const mbody2 = await m.locator("body").innerText();
  log({ step: "M2_sent_state", accepted: /priimt|accepted/i.test(mbody2), line: (mbody2.match(/[^\n]*(priimt|accepted)[^\n]*/i) || [null])[0] });
  await m.screenshot({ path: path.join(OUT, "06-manager-accepted.png") });
  await b.close();
  log({ step: "done", totalMs: Date.now() - t0, readback: "select id, status, invited_email, accepted_by_profile_id, created_at from invitations where lower(invited_email)='" + WORKER + "' order by created_at desc limit 3; select id, relationship_slug, status, created_at from engagement_contexts where profile_id='8cda6488-3f12-4faf-ab60-4e0864bd343a' order by created_at desc limit 3; select action, created_at from audit_logs where action like 'accept_invitation%' order by created_at desc limit 2; select event_name, created_at from pilot_events where event_name='invitation_accepted' order by created_at desc limit 2" });
})().catch((e) => { console.error("WALK_FAILED", e && e.message ? e.message : e); process.exit(1); });
