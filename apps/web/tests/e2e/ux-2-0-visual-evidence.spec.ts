import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * UX 2.0 visual evidence + layout assertions.
 *
 * One spec that captures the labelled before/after evidence each stage gate
 * requires (viewport × theme × locale × scenario) AND asserts the measurable
 * properties the master audit made claims about — so the screenshots are never
 * the only proof. Runs against the LOCAL stack with a real session
 * (`pnpm -C apps/web e2e:local`); skips without minted storage state.
 *
 * Every capture is named `<scenario>__<theme>__<viewport>.png` so a reviewer
 * can pair them without guessing, and each test annotates the commit SHA,
 * theme, locale and viewport it ran at.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(!HAS_SESSION, `Storage state ${STORAGE_STATE} missing — mint a session first.`);
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

const SHA = process.env.UX_EVIDENCE_SHA ?? "working-tree";

type Theme = "dark" | "light";

/** Pin a theme the way the product does — the stored preference the no-flash
 *  bootstrap reads — so the capture exercises the real code path. */
async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t as string);
    } catch {
      /* ignore */
    }
  }, theme);
}

/**
 * Wait until React has hydrated before typing.
 *
 * `domcontentloaded` returns while the server HTML is on screen but before
 * listeners are attached, so `fill()` writes the DOM value, React state stays
 * empty, and the send button never enables. `data-surface` is stamped on
 * <html> by the chrome effect, which only runs post-hydration — the earliest
 * honest "the client is live" signal the product already exposes.
 */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.surface === "conversation",
    null,
    { timeout: 30_000 },
  );
}

async function annotate(
  page: Page,
  scenario: string,
  theme: Theme,
  viewport: string,
  locale = "lt",
): Promise<void> {
  test.info().annotations.push({
    type: "evidence",
    description: `scenario=${scenario} theme=${theme} viewport=${viewport} locale=${locale} sha=${SHA} url=${page.url()}`,
  });
}

async function shot(
  page: Page,
  scenario: string,
  theme: Theme,
  viewport: string,
): Promise<void> {
  await page.screenshot({
    path: test.info().outputPath(`${scenario}__${theme}__${viewport}.png`),
    fullPage: false,
  });
}

/** The measurable facts the audit asserted about the conversation surface. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const size = (sel: string): number | null => {
      const el = document.querySelector(sel);
      return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) : null;
    };
    const radius = (sel: string): number | null => {
      const el = document.querySelector(sel);
      return el ? Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius)) : null;
    };
    // Smallest rendered font size across the whole conversation subtree.
    let min = Infinity;
    const root = document.querySelector('[data-testid="conversation-chat"]');
    if (root) {
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        const t = (el.textContent ?? "").trim();
        if (!t || el.children.length > 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (Number.isFinite(fs) && fs > 0) min = Math.min(min, fs);
      }
    }
    return {
      theme: document.documentElement.dataset.theme ?? null,
      h1Count: document.querySelectorAll("h1").length,
      greetingPx: size('[data-testid="msg-greeting"] h1'),
      composerPx: size('[data-testid="composer-input"]'),
      chipPx: size('[data-testid^="chat-chip-"]'),
      chipHeight: (() => {
        const el = document.querySelector('[data-testid^="chat-chip-"]');
        return el ? Math.round(el.getBoundingClientRect().height) : null;
      })(),
      minRenderedPx: Number.isFinite(min) ? Math.round(min * 100) / 100 : null,
      composerRadius: radius('[data-testid="composer-input"]'),
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

const VIEWPORTS = [
  { name: "desktop-1536x864", width: 1536, height: 864 },
  { name: "desktop-1366x768", width: 1366, height: 768 },
  { name: "mobile-390x844", width: 390, height: 844 },
] as const;

for (const theme of ["light", "dark"] as const) {
  for (const vp of VIEWPORTS) {
    test.describe(`${theme} · ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test(`empty conversation reads as a conversation [${theme}/${vp.name}]`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("msg-greeting")).toBeVisible();

        const m = await measure(page);
        await annotate(page, "empty-state", theme, vp.name);
        await shot(page, "empty-state", theme, vp.name);

        // ── the audit's measured defects, now assertions ──────────────────
        expect(m.theme, "stored preference must win").toBe(theme);
        expect(m.h1Count, "exactly one page title").toBe(1);
        // greeting: 22px on phones, 28px from sm: up
        expect(m.greetingPx!).toBeGreaterThanOrEqual(vp.width < 640 ? 22 : 26);
        // message body / composer at the reading size
        expect(m.composerPx!).toBeGreaterThanOrEqual(16);
        // no 10–11px type anywhere in the rendered conversation
        expect(m.minRenderedPx!, "12px floor").toBeGreaterThanOrEqual(12);
        // touch targets
        expect(m.chipHeight!, "44px floor").toBeGreaterThanOrEqual(44);
        // bubble radius is the softest surface
        expect(m.composerRadius!).toBeGreaterThanOrEqual(24);
        // never sideways
        expect(m.horizontalOverflow).toBeLessThanOrEqual(1);
      });

      test(`active conversation keeps the hierarchy [${theme}/${vp.name}]`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
        await hydrated(page);

        // A real turn: the server-derived profile summary card.
        await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
        await page.getByTestId("composer-send").click();
        await expect(page.getByTestId("msg-user").last()).toBeVisible();
        await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({
          timeout: 30_000,
        });

        const m = await measure(page);
        await annotate(page, "active-conversation", theme, vp.name);
        await shot(page, "active-conversation", theme, vp.name);

        expect(m.h1Count, "still exactly one page title").toBe(1);
        expect(m.minRenderedPx!, "12px floor holds with cards rendered").toBeGreaterThanOrEqual(12);
        expect(m.horizontalOverflow).toBeLessThanOrEqual(1);
      });
    });
  }
}

test.describe("theme resolution matrix", () => {
  /** Read the resolved theme plus the page background actually painted. */
  async function resolved(page: Page) {
    return page.evaluate(() => ({
      attr: document.documentElement.dataset.theme ?? null,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      pageBg: getComputedStyle(document.body).backgroundColor,
      toggleVisible: !!document.querySelector('[data-testid="chat-theme-toggle"]'),
    }));
  }
  /** Rough "is this a light surface" test on the painted background. */
  const isLight = (rgb: string): boolean => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
  };

  test("no stored preference → LIGHT (the product default)", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("theme");
      } catch {
        /* ignore */
      }
    });
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    const r = await resolved(page);
    expect(r.attr, "bootstrap stamps a definite theme").toBe("light");
    expect(r.scheme).toBe("light");
    expect(isLight(r.pageBg), `page bg ${r.pageBg} must be light`).toBe(true);
    expect(r.toggleVisible, "the way back to dark must be visible").toBe(true);
    await shot(page, "theme-default-no-preference", "light", "desktop");
  });

  test("stored DARK is honoured, never overwritten", async ({ page }) => {
    await useTheme(page, "dark");
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    const r = await resolved(page);
    expect(r.attr).toBe("dark");
    expect(r.scheme).toBe("dark");
    expect(isLight(r.pageBg), `page bg ${r.pageBg} must be dark`).toBe(false);
    await shot(page, "theme-stored-dark", "dark", "desktop");
  });

  test("stored LIGHT is honoured", async ({ page }) => {
    await useTheme(page, "light");
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    const r = await resolved(page);
    expect(r.attr).toBe("light");
    expect(isLight(r.pageBg)).toBe(true);
  });

  test("a system dark preference does NOT override the product default", async ({ browser }) => {
    // Documented owner rule: the product ships light unless the USER chose dark.
    const ctx = await browser.newContext({
      storageState: STORAGE_STATE,
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    const r = await resolved(page);
    expect(r.attr, "OS dark must not win over the product default").toBe("light");
    await ctx.close();
  });

  test("no flash: the theme is resolved before the first paint", async ({ page }) => {
    await useTheme(page, "dark");
    // Sample the resolved theme at the very first script execution point in the
    // document — if the bootstrap ran pre-paint, the attribute is already set.
    const early: string[] = [];
    await page.addInitScript(() => {
      // Records the state as soon as <head> scripts have run.
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __earlyTheme?: string }).__earlyTheme =
          document.documentElement.dataset.theme ?? "none";
      });
    });
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    const earlyTheme = await page.evaluate(
      () => (window as unknown as { __earlyTheme?: string }).__earlyTheme ?? "none",
    );
    early.push(earlyTheme);
    expect(earlyTheme, "theme must be stamped before DOMContentLoaded").toBe("dark");

    // …and it survives hydration.
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    expect((await resolved(page)).attr).toBe("dark");
  });

  test("the toggle round-trips and persists", async ({ page }) => {
    // Deliberately NOT `useTheme()` here: that seeds localStorage via
    // addInitScript, which re-runs on the reload below and would overwrite the
    // very value the toggle just stored. Starting from the light DEFAULT is
    // both simpler and closer to a real first-time user.
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    await page.getByTestId("chat-theme-toggle").click();
    await expect
      .poll(async () => (await resolved(page)).attr, { timeout: 10_000 })
      .toBe("dark");
    expect(await page.evaluate(() => window.localStorage.getItem("theme"))).toBe("dark");

    // Survives a full reload — the stored choice, not a session flag.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    expect((await resolved(page)).attr).toBe("dark");
  });
});

test.describe("long-text capacity (LT / EN / RU)", () => {
  for (const locale of ["lt", "en", "ru"] as const) {
    test(`greeting and cards survive ${locale.toUpperCase()} string lengths`, async ({ page }) => {
      await useTheme(page, "light");
      await page.goto(`/${locale}/dashboard`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("msg-greeting")).toBeVisible();

      const m = await measure(page);
      await annotate(page, "locale-capacity", "light", "desktop-1366x768", locale);
      await shot(page, `locale-${locale}`, "light", "desktop-1366x768");

      expect(m.h1Count).toBe(1);
      expect(m.horizontalOverflow, `${locale}: no sideways scroll`).toBeLessThanOrEqual(1);
      expect(m.minRenderedPx!).toBeGreaterThanOrEqual(12);
    });
  }
});
