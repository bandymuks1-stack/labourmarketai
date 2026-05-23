/**
 * Mobile capture for the /vision page. Public route — no auth required,
 * so this is the rare case where the captures show the real visible
 * surface the way a prospective pilot participant would see it.
 *
 * Output:  docs/evidence/supergrand-vision-os-leap-v1/screenshots/
 * Usage:   pnpm -C apps/web tsx scripts/capture-vision-mobile.ts
 */
import { chromium, devices } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "docs",
  "evidence",
  "supergrand-vision-os-leap-v1",
  "screenshots",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "01-vision-hero",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
    },
  },
  {
    name: "02-vision-workflow",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-workflow").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "03-vision-today",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-today").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "04-vision-roles",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-roles").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "05-vision-activities",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-activities").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "06-vision-preparing",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-preparing").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "07-vision-control-room",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-control-room").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "08-vision-future",
    url: "/lt/vision",
    prepare: async (page) => {
      await page.locator("#vision-future").scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
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
    await page.screenshot({ path: file });
    console.log(`  saved ${file}`);
  }

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
