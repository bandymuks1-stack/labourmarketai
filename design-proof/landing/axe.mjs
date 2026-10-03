import { chromium } from "../../node_modules/@playwright/test/index.mjs";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const base = "http://127.0.0.1:3201";
const browser = await chromium.launch();
const res = { axe: [], overflow: [] };
for (const reduce of [false, true]) {
  for (const p of ["/en", "/en/for-workers", "/en/for-companies"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduce ? "reduce" : "no-preference" });
    ctx.setDefaultNavigationTimeout(300000);
    const page = await ctx.newPage();
    await page.goto(base + p, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator('[data-testid="cinematic-story"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await page.addScriptTag({ path: AXE });
    const v = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, t: x.nodes[0]?.target.join(" ").slice(0, 100) }));
    });
    res.axe.push({ page: p, reduced: reduce, violations: v });
    console.log("axe", p, reduce ? "reduced" : "motion", JSON.stringify(v.filter((x) => ["serious", "critical"].includes(x.impact))), "all:", v.map((x) => x.id + ":" + x.impact).join(","));
    await ctx.close();
  }
}
for (const loc of ["en", "lt", "de", "pl", "ru", "nl"]) {
  for (const p of ["", "/for-workers", "/for-companies"]) {
    for (const w of [375, 1280]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 812 } });
      ctx.setDefaultNavigationTimeout(300000);
      const page = await ctx.newPage();
      await page.goto(`${base}/${loc}${p}`, { waitUntil: "load" });
      await page.waitForLoadState("networkidle").catch(() => {});
      // walk the scenes so every scene's text is on stage, and measure each one's overflow
      let worst = 0;
      for (let i = 0; i < 9; i++) {
        await page.evaluate((i) => { const b = document.querySelector(`.cine-beat[data-beat="${i}"]`); const r = b.getBoundingClientRect(); window.scrollTo(0, scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2 + 4); }, i);
        await page.waitForTimeout(250);
        const o = await page.evaluate(() => {
          const d = document.documentElement.scrollWidth - innerWidth;
          // any entity or caption wider than the stage / clipped text?
          const st = document.querySelector(".cine-stage").getBoundingClientRect();
          let bad = 0;
          document.querySelectorAll('.cine-ent[data-on="true"], .cine-cap').forEach((e) => { const r = e.getBoundingClientRect(); if (r.left < st.left - 2 || r.right > st.right + 2) bad++; });
          return Math.max(d, 0) + bad * 1000;
        });
        worst = Math.max(worst, o);
      }
      res.overflow.push({ loc, p, w, worst });
      if (worst) console.log("OVERFLOW", loc, p, w, worst);
      await ctx.close();
    }
  }
}
console.log("overflow checks:", res.overflow.length, "with issues:", res.overflow.filter((x) => x.worst).length);
writeFileSync(new URL("./after/axe-overflow.json", import.meta.url), JSON.stringify(res, null, 2));
await browser.close();
