const fs = require("node:fs"); const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test"); const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8"); const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
(async () => {
  const h = await (await fetch("https://labourmarket.ai/api/health")).json(); console.log(JSON.stringify({ build: h.build }));
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const email = "e2e-spine-person-202609051508@labourmarket.ai";
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" });
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, locale: "lt-LT" });
  await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url"), domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
  const p = await c.newPage(); await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.getByTestId("composer-input").waitFor({ timeout: 90000 }); await p.waitForTimeout(7000);
  const before = (await p.getByTestId("conversation-thread").innerText()).length;
  await p.getByTestId("composer-input").fill("Ieškau darbo Vilniuje"); await p.getByTestId("composer-input").press("Enter");
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(1500); const t = await p.getByTestId("conversation-thread").innerText(); if (t.length > before + 60 && (await p.getByTestId("chat-typing").count()) === 0) break; }
  const body = (await p.getByTestId("conversation-thread").innerText()).replace(/\s+/g, " ");
  console.log(JSON.stringify({ gapLine: (body.match(/Profilyje dar tr[^.]*\./) || [null])[0], nurodytasInGap: /tr[ūu]ksta:[^.]*nurodyt/i.test(body) }));
  await b.close();
})().catch((e) => { console.error("PROBE_FAILED", e.message); process.exit(1); });
