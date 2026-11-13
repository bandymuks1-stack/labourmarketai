#!/usr/bin/env node
// Lighthouse numbers for the acceptance matrix: accessibility, SEO and lab speed.
//
//   node .github/scripts/lighthouse-gate.mjs <origin> <runs> <page> [<page> ...]
//   a page given as "!/en/auth/login" is not indexable: its SEO score is not gated.
//
// Each page is measured <runs> times with Lighthouse's default mobile profile
// (simulated slow 4G, 4x CPU slow-down); the MEDIAN of each number is reported.
// Gates (owner 2026-11-12): accessibility >= 95, SEO >= 95 on indexable pages,
// LCP <= 2500 ms, CLS <= 0.1. These are LAB numbers from one runner — PRELIMINARY,
// not real-user p75. INP cannot be measured in a lab run at all; Total Blocking
// Time is printed beside it as the nearest lab signal and is not gated.
//
// Anonymous GETs of public pages only. Exit 1 when a gate is missed or a page
// could not be measured.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [origin, runsArg, ...pageArgs] = process.argv.slice(2);
const runs = Number(runsArg);
if (!origin || !Number.isInteger(runs) || runs < 1 || pageArgs.length === 0) {
  console.error("usage: lighthouse-gate.mjs <origin> <runs> <page> [<page> ...]");
  process.exit(2);
}
export const GATES = { accessibility: 95, seo: 95, lcpMs: 2500, cls: 0.1 };
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const dir = mkdtempSync(join(tmpdir(), "lh-"));
const chromeFlags = `--headless=new --no-sandbox ${process.env.LH_CHROME_FLAGS ?? ""}`.trim();

function measure(url, i) {
  const out = join(dir, `run-${i}-${Math.random().toString(36).slice(2)}.json`);
  const res = spawnSync(
    "npx",
    ["--yes", "lighthouse@12.2.1", url, "--quiet", "--output=json", `--output-path=${out}`,
      "--only-categories=accessibility,seo,performance", `--chrome-flags=${chromeFlags}`],
    { encoding: "utf8", timeout: 180_000 },
  );
  if (res.status !== 0) return null;
  try {
    const r = JSON.parse(readFileSync(out, "utf8"));
    if (r.runtimeError) return null;
    return {
      accessibility: Math.round((r.categories.accessibility.score ?? 0) * 100),
      seo: Math.round((r.categories.seo.score ?? 0) * 100),
      lcpMs: Math.round(r.audits["largest-contentful-paint"].numericValue),
      cls: Number(r.audits["cumulative-layout-shift"].numericValue.toFixed(3)),
      tbtMs: Math.round(r.audits["total-blocking-time"].numericValue),
    };
  } catch {
    return null;
  }
}

let failed = 0;
console.log("page | runs | accessibility | SEO | LCP ms | CLS | TBT ms | status");
console.log("--- | --- | --- | --- | --- | --- | --- | ---");
for (const arg of pageArgs) {
  const indexable = !arg.startsWith("!");
  const page = indexable ? arg : arg.slice(1);
  const got = [];
  // The verdict is a median of <runs> measurements, so it needs all of them:
  // each failed measurement gets ONE more try, and a page whose sample stays
  // short is reported INCOMPLETE and fails — never judged on what was left.
  for (let i = 0; i < runs; i++) {
    const m = measure(origin + page, i) ?? measure(origin + page, i);
    if (m) got.push(m);
  }
  if (got.length === 0) {
    console.log(`${page} | 0 | - | - | - | - | - | NOT MEASURED`);
    failed++;
    continue;
  }
  const m = Object.fromEntries(["accessibility", "seo", "lcpMs", "cls", "tbtMs"].map((k) => [k, median(got.map((g) => g[k]))]));
  const misses = [];
  if (m.accessibility < GATES.accessibility) misses.push("accessibility");
  if (indexable && m.seo < GATES.seo) misses.push("SEO");
  if (m.lcpMs > GATES.lcpMs) misses.push("LCP");
  if (m.cls > GATES.cls) misses.push("CLS");
  const incomplete = got.length < runs;
  if (misses.length || incomplete) failed++;
  const verdict = incomplete
    ? `INCOMPLETE: ${got.length} of ${runs} measurements${misses.length ? `; misses ${misses.join(", ")}` : ""}`
    : misses.length
      ? `FAIL: ${misses.join(", ")}`
      : "PASS";
  console.log(
    `${page} | ${got.length} | ${m.accessibility} | ${indexable ? m.seo : `${m.seo} (not gated)`} | ${m.lcpMs} | ${m.cls} | ${m.tbtMs} | ${verdict}`,
  );
}
console.log(`\ngates: accessibility >= ${GATES.accessibility}, SEO >= ${GATES.seo} (indexable pages), LCP <= ${GATES.lcpMs} ms, CLS <= ${GATES.cls}. Lab medians, PRELIMINARY. INP: not measurable in a lab run.`);
process.exit(failed > 0 ? 1 : 0);
