/**
 * Headless mobile screenshot capture for the text-first foundation. Runs
 * Playwright against the local dev server and saves PNGs under
 * docs/evidence/text-first-mobile/. Does NOT need Supabase auth because the
 * /design/text-first preview is dev-gated by PLACEHOLDER_MARKERS and mocks
 * what would otherwise require a logged-in worker.
 *
 * Usage:  pnpm -C apps/web tsx scripts/capture-mobile.ts
 */
import { chromium, devices } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
// docs/ lives at the repo root (apps/web is the cwd when launched via pnpm).
const OUT = resolve(__dirname, "..", "..", "..", "docs", "evidence", "text-first-mobile");

type Shot = {
  name: string;
  url: string;
  /** Optional setup before the screenshot (clicks, scroll, etc). */
  prepare?: (page: Page) => Promise<void>;
  /** Full page or just the viewport. */
  fullPage?: boolean;
};

const SHOTS: Shot[] = [
  { name: "01-homepage", url: "/lt", fullPage: true },
  { name: "02-auth-login", url: "/lt/auth/login", fullPage: true },
  { name: "03-auth-signup", url: "/lt/auth/signup", fullPage: true },
  {
    name: "04-design-preview-top",
    url: "/lt/design/text-first",
    fullPage: false,
  },
  {
    name: "05-design-preview-full",
    url: "/lt/design/text-first",
    fullPage: true,
  },
  {
    name: "06-design-preview-journal",
    url: "/lt/design/text-first",
    fullPage: false,
    prepare: async (page) => {
      await page.locator('[data-testid="preview-journal"]').scrollIntoViewIfNeeded();
      // small settle for transitions / glow
      await page.waitForTimeout(250);
    },
  },
  {
    name: "07-design-preview-suggestion-cards",
    url: "/lt/design/text-first",
    fullPage: false,
    prepare: async (page) => {
      await page.locator('[data-testid="preview-bare"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "08-design-preview-mobile-sheet-open",
    url: "/lt/design/text-first",
    fullPage: false,
    prepare: async (page) => {
      const trigger = page.getByRole("button", { name: "Open mobile sheet" });
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "09-design-preview-notification-sheet",
    url: "/lt/design/text-first",
    fullPage: false,
    prepare: async (page) => {
      // The notification panel button has aria-label="Pranešimai" (LT).
      const btn = page.getByRole("button", { name: "Pranešimai" });
      await btn.click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "10-design-preview-role-switcher",
    url: "/lt/design/text-first",
    fullPage: false,
    prepare: async (page) => {
      const btn = page.getByRole("button", { name: "Vaidmuo" });
      await btn.click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "11-design-preview-bottom-nav",
    url: "/lt/design/text-first",
    fullPage: false,
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
  // iPhone 13 — matches the canonical mobile QA target.
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
    // Give Next a moment for client hydration / fonts.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    if (shot.prepare) {
      try {
        await shot.prepare(page);
      } catch (e) {
        console.warn(`  prepare failed: ${(e as Error).message}`);
      }
    }
    const file = join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: !!shot.fullPage });
    console.log(`  saved ${file}`);
  }

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
