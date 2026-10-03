/**
 * Discover proof - real screenshots of /dashboard/market per local fixture
 * identity at 1440 and 375, plus the one top bar before/after context.
 *
 * LOCAL ONLY: expects a production build (`next start`) pointed at the LOCAL
 * Supabase stack and storage states minted by scripts/e2e-mint-session.ts
 * (`.storage-state-discover-<role>.json`). It never touches production and
 * never signs in as anything but a local fixture user.
 *
 *   BASE=http://127.0.0.1:3217 node scripts/discover-proof.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE ?? "http://127.0.0.1:3217";
const OUT = process.env.OUT ?? join(process.cwd(), "..", "..", "design-proof", "discover");
mkdirSync(OUT, { recursive: true });

const ROLES = ["worker", "company", "agency"];
const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
];

const browser = await chromium.launch();
for (const role of ROLES) {
  const storage = join(process.cwd(), "tests", "e2e", `.storage-state-discover-${role}.json`);
  if (!existsSync(storage)) {
    console.log(`SKIP ${role}: no minted session (${storage})`);
    continue;
  }
  for (const size of SIZES) {
    const ctx = await browser.newContext({
      storageState: storage,
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const url = `${BASE}/en/dashboard/market`;
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector('[data-testid="discover-page"]', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const cards = await page.$$eval('[data-testid^="discover-card-"]', (els) =>
      els.map((e) => e.getAttribute("data-testid").replace("discover-card-", "")),
    );
    const small = await page.$$eval('[data-testid^="discover-card-"], [data-testid^="header-core-nav-"]', (els) =>
      els
        .map((e) => ({ id: e.getAttribute("data-testid"), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
        .filter((r) => r.h < 44 || r.w < 44),
    );
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(JSON.stringify({ role, size: size.name, url: page.url(), cards, under44: small, horizontalOverflow: overflow }));
    await page.screenshot({ path: join(OUT, `discover-${role}-${size.name}.png`), fullPage: true });
    await page.screenshot({ path: join(OUT, `discover-${role}-${size.name}-fold.png`), fullPage: false });
    await ctx.close();
  }
}
await browser.close();
