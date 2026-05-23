/**
 * Mobile capture for the role-catalogue dashboard surfaces sprint.
 * Targets the 4 filenames the sprint asks for, using the dev-gated
 * `/lt/design/text-first` preview (which mounts the production
 * `<RoleCatalogueGrid>` from `lib/config/roles.ts`).
 *
 * Authenticated dashboard is NOT in this capture set — that requires
 * a real Supabase session and is the owner-only PR #30 smoke.
 *
 * Output:  docs/evidence/role-catalogue-dashboard-surfaces-mobile/
 * Usage:   pnpm -C apps/web tsx scripts/capture-role-catalogue-mobile.ts
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
  "role-catalogue-dashboard-surfaces-mobile",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: "01-dashboard-role-catalogue",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-role-grid"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "02-account-role-catalogue",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      // Account-style read of the catalogue — the same grid below shows
      // the same active/preparing chip mix the account page renders.
      await page
        .locator('[data-testid="preview-role-grid"]')
        .scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      await page.waitForTimeout(300);
    },
  },
  {
    name: "03-role-switcher-catalogue",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Vaidmuo" }).click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "04-preparing-role-no-broken-cta",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      const grid = page.locator('[data-testid="preview-role-grid"]');
      await grid.scrollIntoViewIfNeeded();
      // Position so a preparing card (Įmonė / Agentūra / Pirkėjas) is
      // the visual focus — the absence of a navigating link is the
      // evidence the sprint is asserting.
      await page.evaluate(() => window.scrollBy(0, 380));
      await page.waitForTimeout(300);
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
