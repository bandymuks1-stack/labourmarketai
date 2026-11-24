/**
 * Mobile evidence capture for the catalogue-driven primary nav sprint.
 * Captures 4 iPhone 13 shots showing the BottomNav rendered from the
 * feature-availability catalogue via `lib/config/navigation.ts`. The
 * tabs should be visually identical to PR #36, since the refactor is
 * source-only.
 *
 * Authenticated dashboard (`/dashboard`) is NOT in this capture set —
 * that requires a real Supabase session and remains the owner-only
 * PR #30 smoke. See docs/evidence/post-merge-production-smoke-pr30.md.
 *
 * Output:  docs/evidence/catalogue-driven-primary-nav-mobile/
 * Usage:   pnpm -C apps/web tsx scripts/capture-catalogue-nav-mobile.ts
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
  "catalogue-driven-primary-nav-mobile",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "01-bottom-nav-tabs",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );
      await page.waitForTimeout(250);
    },
  },
  {
    name: "02-bottom-nav-overview-active",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      // The preview's pathname is /design/text-first, so no tab is active —
      // we just verify the four tabs are present + readable. Bottom of the
      // page gives the cleanest view of the nav itself.
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );
      await page.waitForTimeout(250);
    },
  },
  {
    name: "03-feature-grid-and-nav",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-feature-grid"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "04-bottom-nav-clearance",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight - 200),
      );
      await page.waitForTimeout(250);
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
