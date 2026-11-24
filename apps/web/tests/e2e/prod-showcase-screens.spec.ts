import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { stripPngMetadata } from "../../lib/testing/living-cv-deidentify";
import { test } from "./prod-walk";

/**
 * prod-showcase-screens — production showcase screenshots (owner order 2026-11-24).
 *
 * Read-only, SYNTHETIC QA accounts only (the allowlisted cast the walk already mints): a worker,
 * a company owner, an agency, a buyer and a learner. No real person's account is used. The walk
 * only opens pages and opens the main navigation; it never presses a save, send or confirm control.
 *
 * Each screen at 1440 (desktop) and 390 (phone) px, Chromium, as a metadata-free PNG written to
 * PROD_QA_LCV_DIR (outside the repository). The workflow zips them with `manifest.json`, encrypts
 * the zip with a random AES-256 key and that key with the coordinator's public key, uploads only
 * the two encrypted files and destroys the plaintext (the same step as living-cv-screens).
 *
 * Each screen stands alone: one that does not open is recorded FAIL in the manifest and the next
 * one runs. Failures name a fixed cause, never page text or a URL.
 */

const OUT = process.env.PROD_QA_LCV_DIR ?? "";
const ORIGIN = new URL(process.env.E2E_BASE_URL || "https://labourmarket.ai").origin;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);

const VIEWPORTS = [
  { key: "1440", options: { viewport: { width: 1440, height: 900 } } },
  { key: "390", options: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] as const;

type Kind = "page" | "nav";
interface Shot {
  readonly id: string;
  readonly slot: string;
  /** organization workspace first (the first organization in the account's chip). */
  readonly org: boolean;
  readonly path: string;
  readonly kind: Kind;
  readonly full: boolean;
}

/**
 * The organization Living CV surface is the company history until Lane E names another one; the
 * path is one constant so the change is one line.
 */
const ORG_LIVING_CV = "/dashboard/company/history";

const SHOTS: readonly Shot[] = [
  { id: "worker-home", slot: "worker2", org: false, path: "/dashboard", kind: "page", full: false },
  { id: "worker-nav", slot: "worker2", org: false, path: "/dashboard", kind: "nav", full: false },
  { id: "worker-cv", slot: "worker2", org: false, path: "/cv", kind: "page", full: true },
  { id: "worker-chat", slot: "worker2", org: false, path: "/dashboard/communication", kind: "page", full: false },
  { id: "company-home", slot: "owner", org: true, path: "/dashboard", kind: "page", full: false },
  { id: "company-nav", slot: "owner", org: true, path: "/dashboard", kind: "nav", full: false },
  { id: "company-living-cv", slot: "owner", org: true, path: ORG_LIVING_CV, kind: "page", full: true },
  { id: "company-chat", slot: "owner", org: true, path: "/dashboard/communication", kind: "page", full: false },
  { id: "agency-home", slot: "agency", org: true, path: "/dashboard", kind: "page", full: false },
  { id: "agency-nav", slot: "agency", org: true, path: "/dashboard", kind: "nav", full: false },
  { id: "agency-chat", slot: "agency", org: true, path: "/dashboard/communication", kind: "page", full: false },
  { id: "buyer-home", slot: "buyer", org: false, path: "/dashboard", kind: "page", full: false },
  { id: "buyer-nav", slot: "buyer", org: false, path: "/dashboard", kind: "nav", full: false },
  { id: "buyer-chat", slot: "buyer", org: false, path: "/dashboard/communication", kind: "page", full: false },
  { id: "learner-learning", slot: "worker2", org: false, path: "/dashboard/learning", kind: "page", full: true },
];

const CAUSES = ["session not minted", "redirected to onboarding", "page did not open", "no main", "navigation did not open", "timeout", "other"] as const;
function causeOf(e: unknown): (typeof CAUSES)[number] {
  const m = e instanceof Error ? e.message : "";
  if ((CAUSES as readonly string[]).includes(m)) return m as (typeof CAUSES)[number];
  if (e instanceof Error && e.name === "TimeoutError") return "timeout";
  return "other";
}

async function open(page: Page, path: string): Promise<void> {
  const res = await page.goto(`${ORIGIN}/lt${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!res || res.status() >= 400) throw new Error("page did not open");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  if (/\/onboarding(\/|$)/.test(new URL(page.url()).pathname)) throw new Error("redirected to onboarding");
  if (!(await page.locator("main").first().isVisible({ timeout: 30_000 }).catch(() => false))) throw new Error("no main");
}

/** The account's first organization workspace, through the header chip (no text matching). */
async function firstOrganization(page: Page): Promise<void> {
  await open(page, "/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  if (!(await chip.isVisible({ timeout: 15_000 }).catch(() => false))) return;
  await chip.getByRole("button").first().click();
  const options = page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]:not([data-testid="workspace-option-personal"])');
  if ((await options.count()) === 0) return;
  const first = options.first();
  if ((await first.getAttribute("aria-current")) !== "true") {
    await first.click();
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  } else {
    await page.keyboard.press("Escape");
  }
}

/** Open the main navigation: the "more" menu on a computer, the navigation sheet on a phone. */
async function openNav(page: Page, phone: boolean): Promise<void> {
  const trigger = page.getByTestId(phone ? "header-nav-sheet-trigger" : "header-nav-more").first();
  if (!(await trigger.isVisible({ timeout: 15_000 }).catch(() => false))) throw new Error("navigation did not open");
  await trigger.click();
  const panel = page.getByTestId(phone ? "header-nav-sheet" : "header-nav-more-menu").first();
  if (!(await panel.isVisible({ timeout: 15_000 }).catch(() => false))) throw new Error("navigation did not open");
}

interface Result {
  readonly screen: string;
  readonly viewport: string;
  readonly file: string | null;
  /** No privacy check runs on these synthetic-account screens (no rewrite, no DOM scan): said so. */
  readonly privacy: "NOT_CHECKED";
  readonly layout: "n/a";
  readonly status: "PASS" | "FAIL";
  readonly reasons: readonly string[];
}

test.describe.configure({ mode: "serial" });
test.setTimeout(20 * 60_000);

test("SHOW. production showcase screens on the synthetic accounts, 1440 and 390 px", async ({ browser }: { browser: Browser }) => {
  if (!OUT || !isAbsolute(OUT) || resolve(OUT).startsWith(resolve(__dirname, "..", "..", ".."))) {
    throw new Error("PROD_QA_LCV_DIR must be an absolute directory outside the repository");
  }
  mkdirSync(OUT, { recursive: true, mode: 0o700 });
  const results: Result[] = [];

  for (const vp of VIEWPORTS) {
    const phone = vp.key === "390";
    const bySlot = new Map<string, BrowserContext>();
    try {
      for (const shot of SHOTS) {
        const file = `${shot.id}-${vp.key}.png`;
        try {
          if (!existsSync(state(shot.slot))) throw new Error("session not minted");
          let ctx = bySlot.get(shot.slot);
          if (!ctx) {
            ctx = await browser.newContext({ storageState: state(shot.slot), locale: "lt-LT", ...vp.options });
            bySlot.set(shot.slot, ctx);
          }
          const page = ctx.pages()[0] ?? (await ctx.newPage());
          if (shot.org) await firstOrganization(page);
          await open(page, shot.path);
          if (shot.kind === "nav") await openNav(page, phone);
          const png = stripPngMetadata(await page.screenshot({ fullPage: shot.full, animations: "disabled", caret: "hide" }));
          writeFileSync(join(OUT, file), png, { mode: 0o600 });
          if (shot.kind === "nav") await page.keyboard.press("Escape").catch(() => undefined);
          results.push({ screen: shot.id, viewport: vp.key, file, privacy: "NOT_CHECKED", layout: "n/a", status: "PASS", reasons: [] });
        } catch (e) {
          results.push({ screen: shot.id, viewport: vp.key, file: null, privacy: "NOT_CHECKED", layout: "n/a", status: "FAIL", reasons: [`not generated: ${causeOf(e)}`] });
        }
      }
    } finally {
      for (const ctx of bySlot.values()) await ctx.close();
    }
  }

  const expected = VIEWPORTS.length * SHOTS.length;
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ expected, screens: results }, null, 2), { mode: 0o600 });
  const failed = results.filter((r) => r.status === "FAIL");
  if (failed.length > 0) {
    throw new Error(`showcase-screens: ${failed.length} of ${results.length} screens FAIL: ${failed.map((r) => `${r.screen}-${r.viewport}`).join(", ")} (reasons in the encrypted manifest)`);
  }
});
