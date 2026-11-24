/**
 * W7-S3 — count the DB work of ONE `/dashboard/profile` render, from Postgres
 * itself. LOCAL ONLY.
 *
 * `pg_stat_statements` is reset, the page is rendered once, and the resulting
 * call total is read back. This answers the question a stage count cannot:
 * did flattening the waterfall change how much the database is asked to do?
 * It must not — the slice reorders reads, it does not add or remove them.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3470";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const CONTAINER = "supabase_db_labourmarketai";
const psql = (sql) =>
  execFileSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql], {
    encoding: "utf8",
  }).trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "lt-LT" });
const page = await ctx.newPage();
await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.fill('input[type="email"]', process.env.UX_EMAIL ?? "dev.worker@local.test");
await page.fill('input[type="password"]', "password");
await page.click('button[type="submit"]');
await page.waitForURL(/dashboard/, { timeout: 120_000 });
// warm: compile the route and settle any first-visit work
await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 240_000 });
await page.waitForTimeout(6000);

const SAMPLES = Number(process.env.UX_SAMPLES ?? 3);
const totals = [];
for (let i = 0; i < SAMPLES; i++) {
  psql("select pg_stat_statements_reset();");
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(6000);
  const calls = Number(
    psql(
      "select coalesce(sum(calls),0) from pg_stat_statements where query not ilike '%pg_stat_statements%';",
    ),
  );
  const selects = Number(
    psql(
      "select coalesce(sum(calls),0) from pg_stat_statements where query ilike 'select%' and query not ilike '%pg_stat_statements%';",
    ),
  );
  totals.push({ calls, selects });
  console.log(`  sample ${i + 1}: calls=${calls} selects=${selects}`);
}
await browser.close();

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
  JSON.stringify(
    {
      phase: process.env.UX_PHASE ?? "after",
      samples: totals,
      medianCalls: med(totals.map((t) => t.calls)),
      medianSelects: med(totals.map((t) => t.selects)),
    },
    null,
    2,
  ),
);
