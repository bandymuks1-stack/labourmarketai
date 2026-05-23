/**
 * First-working-beta mobile evidence capture. Targets the 8 filenames the
 * sprint brief asks for, using the dev-gated `/lt/design/text-first`
 * preview as the source for authenticated-looking shots (the sandbox has
 * no real Supabase session to log in with).
 *
 * Output:  docs/evidence/first-working-beta-mobile/<filename>.png
 * Usage:   pnpm -C apps/web tsx scripts/capture-first-beta-mobile.ts
 * Server:  expects a running app at `E2E_BASE_URL` (defaults 127.0.0.1:3000).
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
  "first-working-beta-mobile",
);

type Shot = {
  name: string;
  url: string;
  prepare?: (page: Page) => Promise<void>;
  fullPage?: boolean;
};

/** The preview page renders the production composers with mock data. We
 *  scroll to the relevant section + open whichever sheet / dropdown the
 *  shot is about, so each PNG shows the real component. */
const SHOTS: Shot[] = [
  {
    name: "01-dashboard-first-use",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      // Top of the page renders the preview header + the profile section
      // that mounts the same composer the worker dashboard now leads with.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
    },
  },
  {
    name: "02-profile-text-first",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-text-first"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "03-profile-suggestions",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      const composer = page.locator('[data-testid="preview-text-first"]');
      await composer.scrollIntoViewIfNeeded();
      const textarea = composer.locator("textarea").first();
      await textarea.fill(
        "Dirbau klientų aptarnavime, kūriau svetaines, vedžiau 4 žmonių komandą.",
      );
      await composer
        .getByRole("button", { name: "Pasiūlykite struktūrą" })
        .first()
        .click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "04-journal-text-first",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page
        .locator('[data-testid="preview-journal"]')
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    name: "05-journal-suggestions",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      const journal = page.locator('[data-testid="preview-journal"]');
      await journal.scrollIntoViewIfNeeded();
      const textarea = journal.locator("textarea").first();
      await textarea.fill(
        "Dirbau 6 valandas. Aptarnavau klientus, sutvarkiau 12 užklausų ir paruošiau dienos ataskaitą.",
      );
      await journal
        .getByRole("button", { name: "Pasiūlykite struktūrą" })
        .first()
        .click();
      await page.waitForTimeout(400);
    },
  },
  {
    name: "06-account-roles",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      // The preview header contains the real RoleSwitcher; opening it shows
      // RUOŠIAMA chips and the new rolesIntro paragraph.
      await page.getByRole("button", { name: "Vaidmuo" }).click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "07-notification-sheet",
    url: "/lt/design/text-first",
    prepare: async (page) => {
      await page.getByRole("button", { name: "Pranešimai" }).click();
      await page.waitForTimeout(250);
    },
  },
  {
    name: "08-bottom-nav-cta-clearance",
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
