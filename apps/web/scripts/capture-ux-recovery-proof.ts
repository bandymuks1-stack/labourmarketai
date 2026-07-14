/**
 * Owner UX recovery v1 — after-screenshot proof pack.
 *
 * Local-only, on-demand (NOT a build step). Loads the gitignored Playwright
 * storageState minted by scripts/e2e-mint-session.ts (never prints tokens),
 * drives the LOCAL dev server and captures the redesigned surfaces at
 * desktop + mobile widths into the gitignored runtime/ tree.
 *
 *   pnpm tsx scripts/capture-ux-recovery-proof.ts
 *
 * Requires: dev server on http://localhost:3000, tests/e2e/.storage-state.json.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.PROOF_BASE_URL ?? "http://127.0.0.1:3000";
const STATE = join(process.cwd(), "tests", "e2e", ".storage-state.json");
const OUT = join(process.cwd(), "..", "..", "runtime", "ux-recovery-proof");

const PAGES: ReadonlyArray<readonly [string, string]> = [
  ["dashboard", "/lt/dashboard"],
  ["journal", "/lt/dashboard/journal"],
  ["calendar", "/lt/dashboard/planning"],
  ["messages", "/lt/dashboard/communication"],
  ["network", "/lt/dashboard/network"],
  ["market-map", "/lt/dashboard/market-map"],
  ["admin", "/lt/dashboard/admin"],
];

const VIEWPORTS = [
  { key: "desktop", width: 1440, height: 900 },
  { key: "mobile", width: 390, height: 844 },
] as const;

async function main(): Promise<void> {
  if (!existsSync(STATE)) {
    throw new Error("storage state missing — run scripts/e2e-mint-session.ts first");
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        storageState: STATE,
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await ctx.newPage();
      for (const [name, path] of PAGES) {
        try {
          await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
          await page.waitForTimeout(1200);
          await page.screenshot({
            path: join(OUT, `${name}-${vp.key}.png`),
            fullPage: true,
          });
          console.log(`ok ${name} (${vp.key}) → ${page.url()}`);
        } catch (e) {
          console.error(`FAIL ${name} (${vp.key}): ${(e as Error).message.split("\n")[0]}`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
