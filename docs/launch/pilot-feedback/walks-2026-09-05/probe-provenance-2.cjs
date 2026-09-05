const fs = require("node:fs"); const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test"); const { createClient } = require(ROOT + "/node_modules/@supabase/supabase-js");
const txt = fs.readFileSync(ROOT + "/apps/web/.env.local", "utf8"); const get = (k) => { const m = txt.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
(async () => {
  const url = get("NEXT_PUBLIC_SUPABASE_URL"); const admin = createClient(url, get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const email = "e2e-worker2-202609021527@labourmarket.ai";
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anon = createClient(url, get("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sess } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "magiclink" });
  const cookie = "base64-" + Buffer.from(JSON.stringify(sess.session)).toString("base64url");
  const b = await chromium.launch();
  for (const width of [1280, 390]) {
    const c = await b.newContext({ viewport: { width, height: 900 }, locale: "lt-LT" });
    await c.addCookies([{ name: "sb-gorgitwvdzxbnaxhrsrw-auth-token", value: cookie, domain: "labourmarket.ai", path: "/", secure: true, sameSite: "Lax" }]);
    const p = await c.newPage(); await p.goto("https://labourmarket.ai/lt/dashboard/journal", { waitUntil: "domcontentloaded", timeout: 60000 });
    await p.locator("[data-testid=worker-player-card]").first().waitFor({ state: "attached", timeout: 60000 }); await p.waitForTimeout(3000);
    const info = await p.evaluate(() => {
      const cards = Array.from(document.querySelectorAll("[data-testid=worker-player-card]")).map((c) => { const r = c.getBoundingClientRect(); const s = c.querySelector("[data-testid=player-card-provenance]"); const sr = s && s.getBoundingClientRect(); return { cardW: Math.round(r.width), cardH: Math.round(r.height), visible: r.width > 0 && r.height > 0, spanW: sr && Math.round(sr.width), spanScrollW: s && s.scrollWidth, clipped: s ? s.scrollWidth > s.clientWidth + 1 : null, text: s && s.textContent }; });
      return { cards };
    });
    console.log(JSON.stringify({ width, ...info }));
    await p.screenshot({ path: `walk-provenance/07-journal-${width}.png`, fullPage: false });
    // the worker's opening: any "patvirtino" line on the dashboard?
    await p.goto("https://labourmarket.ai/lt/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 }); await p.getByTestId("composer-input").waitFor({ timeout: 90000 }); await p.waitForTimeout(6000);
    const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    console.log(JSON.stringify({ width, patvirtino: (body.match(/[^.]{0,80}patvirtin[^.]{0,80}/gi) || []).slice(0, 4), attentionWords: (body.match(/Laukia|kviečia|Darbdavys/g) || []).length }));
  }
  await b.close();
})().catch((e) => { console.error("PROBE_FAILED", e.message); process.exit(1); });
