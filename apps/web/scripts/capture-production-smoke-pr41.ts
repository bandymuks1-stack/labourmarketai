/**
 * Production smoke capture for PR #41 (vision-hide gate).
 *
 * Hits the LIVE production deploy at labourmarket.ai with an
 * iPhone 13 viewport and saves PNGs into the PR #42 evidence folder.
 * Only public surfaces are touched — authenticated dashboard checks
 * remain owner-only and PENDING.
 *
 * Output:  docs/evidence/production-smoke-pr41/screenshots/
 * Usage:   pnpm -C apps/web tsx scripts/capture-production-smoke-pr41.ts
 */
import { chromium, devices } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "https://labourmarket.ai";
const OUT = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "evidence",
  "production-smoke-pr41",
  "screenshots",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "01-lt-landing-no-vision-in-nav",
    url: "/lt",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "02-en-landing-no-vision-in-nav",
    url: "/en",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "03-lt-vision-internal-preview-banner",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "04-en-vision-internal-preview-banner",
    url: "/en/vision",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "05-lt-vision-control-room",
    url: "/lt/vision",
    prepare: async (page) => {
      await page
        .locator("#vision-control-room")
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await page.waitForTimeout(300);
    },
  },
  {
    name: "06-en-vision-control-room",
    url: "/en/vision",
    prepare: async (page) => {
      await page
        .locator("#vision-control-room")
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await page.waitForTimeout(300);
    },
  },
  {
    name: "07-lt-vision-full-page",
    url: "/lt/vision",
    prepare: async (page) => {
      // Full-page capture so the owner can see the entire surface end
      // to end in one image; the section-specific shots above zoom in.
    },
  },
];

async function main(): Promise<void> {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "lt-LT",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.warn("[console]", msg.text());
  });

  for (const shot of SHOTS) {
    const url = BASE + shot.url;
    console.log(`→ ${shot.name}  ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (e) {
      console.warn(`  goto failed: ${(e as Error).message}`);
      continue;
    }
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => undefined);
    if (shot.prepare) {
      try {
        await shot.prepare(page);
      } catch (e) {
        console.warn(`  prepare failed: ${(e as Error).message}`);
      }
    }
    const file = join(OUT, `${shot.name}.png`);
    const fullPage = shot.name.endsWith("full-page");
    await page.screenshot({ path: file, fullPage });
    console.log(`  saved ${file}`);
  }

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
