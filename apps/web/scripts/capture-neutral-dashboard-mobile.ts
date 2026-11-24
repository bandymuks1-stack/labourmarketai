/**
 * Mobile evidence capture for the neutral-dashboard / feature-availability
 * sprint. Targets the 5 filenames the sprint brief asks for, using the
 * dev-gated `/lt/design/text-first` preview as the source for the
 * production composers + the new <FeatureAvailabilityGrid>.
 *
 * Authenticated dashboard (`/dashboard`) is NOT in this capture set — that
 * requires a real Supabase session and remains the owner-only PR #30
 * smoke. See docs/evidence/post-merge-production-smoke-pr30.md.
 *
 * Output:  docs/evidence/neutral-dashboard-feature-availability-mobile/
 * Usage:   pnpm -C apps/web tsx scripts/capture-neutral-dashboard-mobile.ts
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
  "neutral-dashboard-feature-availability-mobile",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "01-dashboard-neutral-first-use",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
    },
  },
  {
    name: "02-dashboard-active-ctas",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-text-first"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "03-dashboard-preparing-card",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-feature-grid"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "04-account-roles-config-driven",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Vaidmuo" }).click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "05-bottom-nav-clearance",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
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
