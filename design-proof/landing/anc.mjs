import { chromium } from "../../node_modules/@playwright/test/index.mjs";
const base = process.env.BASE ?? "http://127.0.0.1:3201";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base + (process.argv[2] ?? "/en/for-workers"), { waitUntil: "load", timeout: 300000 });
const r = await page.evaluate(() => {
  const out = [];
  let el = document.querySelector(".cine-pin");
  while (el) {
    const cs = getComputedStyle(el);
    out.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 40)} ov=${cs.overflow} ovx=${cs.overflowX} ovy=${cs.overflowY} pos=${cs.position} h=${Math.round(el.getBoundingClientRect().height)}`);
    el = el.parentElement;
  }
  return out;
});
console.log(r.join("\n"));
await browser.close();
