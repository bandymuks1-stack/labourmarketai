// PRODUCTION WALK — the public doors (window 6, lane F; branch fix/cc/w6-public-doors).
//
// WHAT IT PROVES against production, ANONYMOUSLY (no session, no cookie, nothing
// submitted, nothing written):
//   A. /lt and /en: the hero is the canonical axis ("Parodyk, ką moki. Atrask, kur
//      esi reikalingas." / "Show what you can do. Find where you are needed.").
//   B. The final band has FIVE doors and the institution door's href carries
//      ?next=/dashboard/start/company?capability=training_provider (the education
//      intent's own setup path).
//   C. The public entry shows SIX example chips; tapping the service-need and the
//      professional chips gives a recognised reading (data-intent need-service /
//      find-work) with the two auth doors — nothing pre-answered, nothing scripted.
//   D. Zero horizontal overflow at 390 and 320 px on /lt, /en, /lt/professions,
//      /lt/for-workers, /lt/for-companies, /lt/pricing; zero 4xx/5xx responses;
//      no console errors (the CSP report-only notice is not an error of ours).
//   E. /lt/professions names professionals (Buhalteriai, Teisininkai, Programuotojai,
//      Mokytojai) and services in its lead.
//   F. /lt/for-workers and /lt/for-companies no longer say prices are "announced
//      before launch"; they point at the pricing page.
//
//   EXPECT_BUILD=<sha> node docs/launch/pilot-feedback/walks-2026-09-06/walk-public-doors-prod.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const HOST = "https://labourmarket.ai";

const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");
const log = (o) => console.log(JSON.stringify(o));
const OUT = path.join(__dirname, "walk-public-doors", "after"); fs.mkdirSync(OUT, { recursive: true });
const fail = [];
const must = (name, ok, detail) => { log({ check: name, ok: !!ok, detail }); if (!ok) fail.push(name); };
const INSTITUTION_NEXT = "/dashboard/start/company?capability=training_provider";

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);

  const b = await chromium.launch();
  const open = async (route, viewport, locale) => {
    const c = await b.newContext({ viewport, locale });
    const p = await c.newPage();
    const failed = [], errors = [];
    p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
    p.on("console", (m) => { if (m.type() === "error" && !/upgrade-insecure-requests/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    p.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 160)));
    await p.goto(HOST + route, { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(1200);
    return { c, p, failed, errors };
  };
  const overflow = (p) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  const text = (p) => p.evaluate(() => document.body.innerText);

  // ── A + B + C: the landing, desktop, lt and en ─────────────────────────────
  for (const [route, locale, hero, chipCount] of [
    ["/lt", "lt-LT", "Parodyk, ką moki. Atrask, kur esi reikalingas.", 6],
    ["/en", "en-GB", "Show what you can do. Find where you are needed.", 6],
  ]) {
    const { c, p, failed, errors } = await open(route, { width: 1280, height: 900 }, locale);
    const h1 = (await p.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
    must(`A hero ${route}`, h1 === hero, h1);
    const doors = await p.locator('[data-testid^="final-door-"]').evaluateAll((as) => as.map((a) => ({ id: a.getAttribute("data-testid"), href: a.getAttribute("href"), text: a.innerText.trim() })));
    must(`B five doors ${route}`, doors.length === 5, doors.map((d) => d.id).join(","));
    const inst = doors.find((d) => d.id === "final-door-institution");
    const instNext = inst && inst.href.includes("?next=") ? decodeURIComponent(inst.href.split("?next=")[1]) : null;
    must(`B institution door ${route}`, !!inst && inst.href.startsWith(`${route}/auth/signup?next=`) && instNext === INSTITUTION_NEXT, inst ? inst.text + " " + inst.href : "missing");
    const chips = await p.getByTestId("entry-example").allInnerTexts();
    must(`C six examples ${route}`, chips.length === chipCount, chips);
    // Tap the service-need chip (5th) and the professional chip (4th): live routing.
    for (const [idx, intent] of [[4, "need-service"], [3, "find-work"]]) {
      await p.getByTestId("entry-example").nth(idx).click();
      const box = p.getByTestId("entry-understanding");
      await box.waitFor({ timeout: 10000 }).catch(() => {});
      const got = await box.getAttribute("data-intent").catch(() => null);
      const doorsShown = (await p.getByTestId("entry-signup").count()) === 1 && (await p.getByTestId("entry-login").count()) === 1;
      must(`C chip ${idx} routes ${route}`, got === intent && doorsShown, { got, doorsShown, chip: chips[idx] });
    }
    // The signup door carries the sentence through ?next=/dashboard?say=…
    const signupHref = await p.getByTestId("entry-signup").locator("a").getAttribute("href");
    must(`C sentence carried ${route}`, /\/auth\/signup\?next=.*say/.test(decodeURIComponent(signupHref || "")), signupHref);
    await p.screenshot({ path: path.join(OUT, route.replace(/\//g, "_").slice(1) + "-desktop.png") });
    must(`D no 4xx/5xx ${route} desktop`, failed.length === 0, failed);
    must(`D no console errors ${route} desktop`, errors.length === 0, errors);
    await c.close();
  }

  // ── D: overflow at 390 / 320 across the public routes ─────────────────────
  for (const route of ["/lt", "/en", "/lt/professions", "/lt/for-workers", "/lt/for-companies", "/lt/pricing"]) {
    for (const [name, viewport] of [["390", { width: 390, height: 844 }], ["320", { width: 320, height: 568 }]]) {
      const { c, p, failed, errors } = await open(route, viewport, route.startsWith("/en") ? "en-GB" : "lt-LT");
      const ovf = await overflow(p);
      must(`D overflow ${route} @${name}`, ovf <= 0, ovf);
      must(`D no 4xx/5xx ${route} @${name}`, failed.length === 0, failed);
      must(`D no console errors ${route} @${name}`, errors.length === 0, errors);
      if (name === "390") await p.screenshot({ path: path.join(OUT, route.replace(/\//g, "_").slice(1) + "-390.png"), fullPage: true });
      await c.close();
    }
  }

  // ── E: /lt/professions names professionals and services ───────────────────
  {
    const { c, p } = await open("/lt/professions", { width: 1280, height: 900 }, "lt-LT");
    const body = await text(p);
    for (const word of ["Buhalteriai", "Teisininkai", "Programuotojai", "Mokytojai", "Inžinieriai", "paslaugas"]) {
      must(`E professions names ${word}`, body.includes(word));
    }
    await c.close();
  }

  // ── F: payment copy no longer contradicts the pricing page ────────────────
  for (const route of ["/lt/for-workers", "/lt/for-companies", "/lt/for-agencies"]) {
    const { c, p } = await open(route, { width: 1280, height: 900 }, "lt-LT");
    const body = await text(p);
    must(`F no 'announced before launch' ${route}`, !/skelbiam[ao]s? prieš (pilną )?startą/i.test(body));
    must(`F points at pricing page ${route}`, /kainodaros puslap/i.test(body));
    await c.close();
  }

  await b.close();
  log({ done: true, failed: fail, out: OUT });
  if (fail.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
