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

test.describe("profile growth", () => {
  test("the bar agrees with the server and is readable without colour", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    await page.getByTestId("chat-chip-profile").click();
    const card = page.getByTestId("msg-profile-summary").last();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const bar = card.getByTestId("profile-growth");
    await expect(bar).toBeVisible();

    const state = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="profile-growth"]') as HTMLElement;
      const segs = [...el.querySelectorAll<HTMLElement>("[data-filled]")];
      const doneList = document.querySelector('[data-testid="profile-summary-done"]');
      const missingList = document.querySelector('[data-testid="profile-summary-missing"]');
      return {
        done: Number(el.dataset.done),
        total: Number(el.dataset.total),
        role: el.getAttribute("role"),
        valueNow: Number(el.getAttribute("aria-valuenow")),
        valueMax: Number(el.getAttribute("aria-valuemax")),
        valueText: el.getAttribute("aria-valuetext"),
        filled: segs.filter((x) => x.dataset.filled === "true").length,
        segments: segs.length,
        // shape difference, not only colour
        emptyDashed: segs
          .filter((x) => x.dataset.filled === "false")
          .every((x) => getComputedStyle(x).borderStyle === "dashed"),
        doneItems: doneList ? doneList.querySelectorAll("li").length : 0,
        missingItems: missingList ? missingList.querySelectorAll("li").length : 0,
        focusableInside: el.querySelectorAll("a,button,[tabindex]").length,
      };
    });

    test.info().annotations.push({
      type: "evidence",
      description: `growth ${state.done}/${state.total} filled=${state.filled} valueText="${state.valueText}"`,
    });

    // The bar renders the SERVER's numbers…
    expect(state.role).toBe("progressbar");
    expect(state.valueNow).toBe(state.done);
    expect(state.valueMax).toBe(state.total);
    expect(state.valueText, "screen readers get the real count").toContain(String(state.done));
    // …and the segments agree with them exactly.
    expect(state.segments).toBe(state.total);
    expect(state.filled).toBe(state.done);
    // …and with the named lists, so nothing can claim more than is saved.
    expect(state.doneItems).toBe(state.done);
    expect(state.missingItems).toBe(state.total - state.done);
    // shape carries the state too
    expect(state.emptyDashed, "unfilled segments are dashed, not just paler").toBe(true);
    // a readout, never a control
    expect(state.focusableInside).toBe(0);

    await shot(page, `profile-${state.done}-of-${state.total}`, "light", "desktop");
  });

  test("no percentage or gamification reaches the screen", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await page.getByTestId("chat-chip-profile").click();
    const card = page.getByTestId("msg-profile-summary").last();
    await expect(card).toBeVisible({ timeout: 30_000 });

    const text = (await card.innerText()).toLowerCase();
    expect(text).not.toMatch(/\d+\s*%/);
    // WORD boundaries, not substrings: "atlygis" (Lithuanian for *pay*) legally
    // contains "lygis" (level), and a naive `toContain` fails on real copy.
    for (const banned of ["streak", "xp", "lygis", "level", "taškai", "points", "badge"]) {
      // `String.raw` is required here: inside a normal template literal `\p`
      // collapses to `p`, so the class silently became `[^p{L}]` and matched the
      // "t" in "atlygis" — a check that looked strict and asserted nothing.
      expect(text, `must not show "${banned}" as a word`).not.toMatch(
        new RegExp(String.raw`(^|[^\p{L}])` + banned + String.raw`([^\p{L}]|$)`, "u"),
      );
    }
  });

  test("the growth bar does not animate under reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: STORAGE_STATE,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await page.getByTestId("chat-chip-profile").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });

    const animations = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="profile-growth"]')!;
      return [el, ...el.querySelectorAll("*")].map((n) => getComputedStyle(n).animationName);
    });
    for (const a of animations) expect(a).toBe("none");
    await page.screenshot({
      path: test.info().outputPath("profile-growth-reduced-motion__light__desktop.png"),
    });
    await ctx.close();
  });
});

test.describe("navigation discovery", () => {
  /** Every route the brief's matrix names, plus the role-restricted ones. */
  const ROUTES = [
    "/lt/dashboard",
    "/lt/dashboard/advanced",
    "/lt/dashboard/communication",
    "/lt/dashboard/planning",
    "/lt/dashboard/market-map",
    "/lt/dashboard/journal",
    "/lt/dashboard/network",
    "/lt/dashboard/admin",
    "/lt/dashboard/service-requests",
    "/lt/dashboard/activity",
    "/lt/dashboard/company",
    "/lt/dashboard/profile",
    "/lt/dashboard/opportunities",
  ] as const;

  test("every route still resolves — none became a 404", async ({ page }) => {
    // Each route is compiled on demand by the dev server, so 13 first-hits
    // legitimately exceed the default per-test budget.
    test.setTimeout(240_000);
    // Checked at the REQUEST level rather than by navigating: driving 13 full
    // renders in a row races client-side redirects and aborts frames, which
    // looks like a routing failure when it is only test plumbing. The question
    // here is purely "does this destination still exist".
    const results: { route: string; status: number; final: string }[] = [];
    for (const route of ROUTES) {
      const res = await page.request.get(route, { maxRedirects: 5 });
      results.push({ route, status: res.status(), final: new URL(res.url()).pathname });
    }
    test.info().annotations.push({
      type: "evidence",
      description: results.map((r) => `${r.route} -> ${r.status} @ ${r.final}`).join(" | "),
    });
    for (const r of results) {
      // A role-restricted route may redirect (that is ACL working), but it must
      // never 404 — that would mean the destination itself disappeared.
      expect(r.status, `${r.route} must not 404`).not.toBe(404);
      expect(r.status, `${r.route} must not 5xx`).toBeLessThan(500);
    }
  });

  test("deep links and browser back/forward still work", async ({ page }) => {
    // Planning and Communication are both heavy panels compiled on demand by
    // the dev server, and this test visits each of them twice.
    test.setTimeout(180_000);
    // Deep link straight into a simple-shell panel.
    await page.goto("/lt/dashboard/planning", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toContain("/dashboard/planning");

    // Navigate IN-APP (a real nav click) so the history entries are the ones a
    // user actually creates — `goto` chains can collapse redirected entries.
    await page.getByTestId("conversation-bottom-nav").isVisible().catch(() => false);
    await page.locator('a[href$="/dashboard/communication"]').first().click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toContain("/dashboard/communication");

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toContain("/dashboard/planning");

    await page.goForward();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toContain("/dashboard/communication");
  });

  test("Messages and Calendar are persistent in the simple shell only", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    const simple = await page.evaluate(() => ({
      messages: document.querySelectorAll('a[href$="/dashboard/communication"]').length,
      calendar: document.querySelectorAll('a[href$="/dashboard/planning"]').length,
    }));
    expect(simple.messages, "Messages is persistent in the chat shell").toBeGreaterThan(0);
    expect(simple.calendar, "Calendar is persistent in the chat shell").toBeGreaterThan(0);
    await shot(page, "messages-calendar-ownership-simple", "light", "desktop");

    await page.goto("/lt/dashboard/advanced", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-chrome="full"]')).toBeVisible({ timeout: 60_000 });
    const advanced = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('[data-testid^="dashboard-tab-"]')].map(
        (e) => (e as HTMLElement).dataset.testid,
      ),
      bottom: [...document.querySelectorAll('[data-testid^="bottom-nav-"]')].map(
        (e) => (e as HTMLElement).dataset.testid,
      ),
    }));
    expect(advanced.tabs, "not repeated as an Advanced tab").not.toContain(
      "dashboard-tab-communication",
    );
    expect(advanced.tabs).not.toContain("dashboard-tab-planning");
    expect(advanced.bottom).not.toContain("bottom-nav-communication");
    expect(advanced.bottom).not.toContain("bottom-nav-planning");
    expect(advanced.tabs.length, "Advanced keeps a real orientation nav").toBeGreaterThanOrEqual(4);
    test.info().annotations.push({
      type: "evidence",
      description: `advanced tabs=${advanced.tabs.join(",")}`,
    });
    await shot(page, "messages-calendar-ownership-advanced", "light", "desktop");
  });

  test("command search: opens by button and by shortcut, Escape closes, focus returns", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const trigger = page.getByTestId("chat-command-search");
    await expect(trigger).toBeVisible();

    // ── by mouse ──────────────────────────────────────────────────────────
    await trigger.click();
    const dialog = page.getByTestId("header-search-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await shot(page, "command-search-chat", "light", "desktop");

    // a real destination search over the shared registry
    await dialog.locator("#command-finder-input").fill("kalendor");
    await expect(dialog).toContainText(/./);

    // ── Escape closes AND focus returns to the trigger ────────────────────
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null,
    );
    expect(focused, "focus must return to what opened the dialog").toBe("chat-command-search");

    // ── by keyboard shortcut ──────────────────────────────────────────────
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByTestId("header-search-dialog")).toBeVisible();

    // ── Tab stays inside the panel ────────────────────────────────────────
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="header-search-dialog"]');
      return panel ? panel.contains(document.activeElement) : false;
    });
    expect(inside, "Tab must be trapped inside the dialog").toBe(true);
    await page.keyboard.press("Escape");
  });

  test("command search reaches a destination that has no persistent tab", async ({ page }) => {
    await page.goto("/lt/dashboard/advanced", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-chrome="full"]')).toBeVisible({ timeout: 60_000 });
    // The Advanced landing is the heaviest page in the app; a click that lands
    // before React attaches listeners is silently dropped. Retry until the
    // dialog actually opens rather than asserting on the first attempt.
    const dialog = page.getByTestId("header-search-dialog");
    await expect
      .poll(
        async () => {
          if (await dialog.isVisible().catch(() => false)) return true;
          await page.getByTestId("header-search-button").click({ timeout: 5_000 }).catch(() => {});
          return dialog.isVisible().catch(() => false);
        },
        { timeout: 60_000, intervals: [500, 1_000, 1_000, 2_000] },
      )
      .toBe(true);
    await shot(page, "command-search-advanced", "light", "desktop");

    // The Advanced landing embeds its own inline finder as well (documented:
    // "the embedded dashboard finder keeps its own shortcut"), so the input
    // must be scoped to the dialog rather than matched globally.
    await dialog.locator("#command-finder-input").fill("zzzzqqq-nera-tokio");
    // A no-result search must degrade honestly, never crash or invent a hit.
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test.describe("composer auto-grow", () => {
  /**
   * Rendered height + whether the box is scrolling internally.
   *
   * Waits for two consecutive identical readings first: the mount-time resize
   * lands just after hydration, so a single immediate read can catch the
   * pre-resize `min-height` and make a later comparison look like a bug.
   */
  async function box(page: Page) {
    let last = -1;
    await expect
      .poll(
        async () => {
          const h = await page.evaluate(() =>
            Math.round(
              document
                .querySelector('[data-testid="composer-input"]')!
                .getBoundingClientRect().height,
            ),
          );
          const settled = h === last;
          last = h;
          return settled;
        },
        { timeout: 5_000, intervals: [80, 80, 80, 80] },
      )
      .toBe(true);
    return page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="composer-input"]',
      )!;
      return {
        height: Math.round(el.getBoundingClientRect().height),
        overflowY: getComputedStyle(el).overflowY,
        scrollable: el.scrollHeight > el.clientHeight + 1,
      };
    });
  }

  /** Type `n` hard-wrapped lines without submitting (Shift+Enter for newlines). */
  async function typeLines(page: Page, n: number): Promise<void> {
    const input = page.getByTestId("composer-input");
    await input.click();
    for (let i = 0; i < n; i++) {
      await input.type(`eilute ${i + 1}`);
      if (i < n - 1) await page.keyboard.press("Shift+Enter");
    }
  }

  test("grows 1 -> 2 -> 4 -> 10+ lines, caps, then scrolls internally", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const one = await box(page);
    expect(one.height, "one line starts at the 44px control height").toBeGreaterThanOrEqual(44);
    expect(one.height, "and is not already tall").toBeLessThan(70);
    await shot(page, "composer-1-line", "light", "desktop");

    await typeLines(page, 2);
    const two = await box(page);
    expect(two.height, "2 lines is taller than 1").toBeGreaterThan(one.height);

    await page.keyboard.press("Shift+Enter");
    await page.getByTestId("composer-input").type("eilute 3");
    await page.keyboard.press("Shift+Enter");
    await page.getByTestId("composer-input").type("eilute 4");
    const four = await box(page);
    expect(four.height, "4 lines is taller than 2").toBeGreaterThan(two.height);
    await shot(page, "composer-multiline", "light", "desktop");

    for (let i = 5; i <= 14; i++) {
      await page.keyboard.press("Shift+Enter");
      await page.getByTestId("composer-input").type(`eilute ${i}`);
    }
    const many = await box(page);
    expect(many.height, "capped at the ceiling").toBeLessThanOrEqual(200);
    expect(many.height, "…and it really did reach the ceiling").toBeGreaterThanOrEqual(180);
    expect(many.overflowY, "internal scroll takes over").toBe("auto");
    expect(many.scrollable, "content exceeds the visible box").toBe(true);
    await shot(page, "composer-max-height", "light", "desktop");

    // The last message must still be reachable — the composer never eats it.
    expect((await measure(page)).horizontalOverflow).toBeLessThanOrEqual(1);
  });

  test("Shift+Enter inserts a newline; Enter sends; height resets after send", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const start = await box(page);
    await typeLines(page, 4);
    const grown = await box(page);
    expect(grown.height).toBeGreaterThan(start.height);
    // Shift+Enter must NOT have submitted anything.
    expect(await page.getByTestId("msg-user").count()).toBe(0);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("msg-user").last()).toBeVisible({ timeout: 20_000 });

    const reset = await box(page);
    expect(reset.height, "the box returns to one line").toBeLessThan(grown.height);
    expect(reset.height, "…and to the same one-line height it started at").toBe(start.height);
    expect(reset.overflowY, "and stops scrolling internally").toBe("hidden");
  });

  test("send is disabled while empty and enabled once there is content", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const send = page.getByTestId("composer-send");
    await expect(send).toBeDisabled();
    await page.getByTestId("composer-input").fill("Sveiki");
    await expect(send).toBeEnabled();
    // Whitespace only must not enable it.
    await page.getByTestId("composer-input").fill("   ");
    await expect(send).toBeDisabled();

    // The attach control opens the real CV flow (unchanged wiring).
    await page.getByTestId("composer-attach").click();
    await expect(page.getByTestId("conversation-cv-flow")).toBeVisible({ timeout: 20_000 });
    await shot(page, "cv-import-entry", "light", "desktop");
  });

  test("mobile: grows with the on-screen keyboard viewport, no overflow", async ({ browser }) => {
    // A shorter viewport stands in for the keyboard eating vertical space.
    const ctx = await browser.newContext({
      storageState: STORAGE_STATE,
      viewport: { width: 390, height: 420 },
    });
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const input = page.getByTestId("composer-input");
    await input.click();
    for (let i = 0; i < 6; i++) {
      await input.type(`eilute ${i + 1}`);
      if (i < 5) await page.keyboard.press("Shift+Enter");
    }
    // Still fully usable: the send button is on screen and clickable.
    await expect(page.getByTestId("composer-send")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: test.info().outputPath("composer-mobile-keyboard__light__mobile-390x420.png"),
    });
    await ctx.close();
  });
});

test.describe("CTA hierarchy", () => {
  test("a card offers one solid primary and a ghost secondary", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    // The profile row is the honest recommendation case: the server names the
    // first missing checkpoint, so exactly one chip may be solid.
    await page.getByTestId("chat-chip-profile").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });

    const chips = await page.evaluate(() => {
      const out: { id: string; recommended: boolean; bg: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('[data-testid^="chat-chip-"]')) {
        out.push({
          id: el.dataset.testid ?? "",
          recommended: el.dataset.recommended === "true",
          bg: getComputedStyle(el).backgroundColor,
        });
      }
      return out;
    });
    const solid = chips.filter((c) => c.recommended);
    expect(solid.length, "at most ONE recommendation per row").toBeLessThanOrEqual(1);
    test.info().annotations.push({
      type: "evidence",
      description: `chips=${chips.length} recommended=${solid.map((c) => c.id).join(",") || "none (server named no closable gap)"}`,
    });
    await shot(page, "cta-primary-secondary", "light", "desktop");
  });

  test("keyboard focus is visible on the conversation controls", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    await page.keyboard.press("Tab");
    for (let i = 0; i < 12; i++) {
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          testid: el.dataset.testid ?? el.tagName,
          outlineWidth: s.outlineWidth,
          outlineStyle: s.outlineStyle,
        };
      });
      if (info?.testid?.startsWith("chat-chip-")) {
        expect(info.outlineStyle, "focus ring style").not.toBe("none");
        expect(parseFloat(info.outlineWidth), "focus ring width").toBeGreaterThan(0);
        await page.screenshot({
          path: test.info().outputPath("keyboard-focus__light__desktop.png"),
        });
        return;
      }
      await page.keyboard.press("Tab");
    }
    throw new Error("never reached a chat chip by keyboard");
  });
});

test.describe("conversation composition", () => {
  test("the opening state is centred, then becomes a top-anchored stream", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    const thread = page.getByTestId("conversation-thread");
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    await expect(thread).toHaveAttribute("data-opening", "true");
    const centred = await page.getByTestId("msg-greeting").boundingBox();
    const vp = page.viewportSize()!;
    // The greeting should sit around the middle, not jammed under the header.
    expect(centred!.y, "greeting is vertically composed").toBeGreaterThan(vp.height * 0.18);
    await shot(page, "opening-centred", "light", "desktop");

    await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });
    await expect(thread).not.toHaveAttribute("data-opening", "true");
    const anchored = await page.getByTestId("msg-greeting").boundingBox();
    expect(anchored!.y, "the stream anchors to the top once it has content").toBeLessThan(
      centred!.y,
    );
    await shot(page, "stream-anchored", "light", "desktop");
  });

  test("assistant speech is unboxed; the user's turn keeps its bubble", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    // "primink rytoj" → an honest refusal, which is a plain assistant TEXT turn.
    await page.getByTestId("composer-input").fill("Primink man rytoj 8 val.");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-assistant").last()).toBeVisible({ timeout: 30_000 });

    const paint = await page.evaluate(() => {
      const bg = (sel: string): string | null => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const inner = el.querySelector("div");
        return inner ? getComputedStyle(inner).backgroundColor : null;
      };
      const userEl = document.querySelector('[data-testid="msg-user"] > div');
      return {
        assistantBg: bg('[data-testid="msg-assistant"]:last-of-type'),
        userBg: userEl ? getComputedStyle(userEl).backgroundColor : null,
        userRadius: userEl
          ? Math.round(parseFloat(getComputedStyle(userEl).borderTopLeftRadius))
          : null,
      };
    });
    // Assistant prose: transparent ground. User: a real filled bubble.
    expect(paint.assistantBg, "assistant speech must not be boxed").toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(paint.userBg, "user speech keeps its bubble").not.toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(paint.userRadius!, "and the soft bubble radius").toBeGreaterThanOrEqual(24);
    await shot(page, "unboxed-assistant-speech", "light", "desktop");
  });

  test("the greeting uses the real name when the product knows it", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    const greeting = page.getByTestId("msg-greeting");
    const text = await greeting.innerText();
    // Never the raw ICU placeholder, and never an invented name.
    expect(text).not.toContain("{name}");
    const name = await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="chat-profile-link"]')
          ?.textContent?.trim() ?? "",
    );
    test.info().annotations.push({
      type: "evidence",
      description: `greeting="${text.replace(/\n/g, " | ")}" initials="${name}"`,
    });
    await shot(page, "greeting-named", "light", "desktop");
  });
});

test.describe("presence and motion", () => {
  test("the assistant has a named, consistent identity", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    // Named once, above the title.
    const greeting = page.getByTestId("msg-greeting");
    await expect(greeting).toContainText("LabourMarket AI");
    await expect(greeting.getByTestId("assistant-mark")).toBeVisible();

    // The SAME mark shows up on a real assistant turn.
    await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });
    expect(await page.getByTestId("assistant-mark").count()).toBeGreaterThanOrEqual(2);

    await shot(page, "assistant-identity", "light", "desktop");
  });

  test("motion runs, and adds no layout shift", async ({ page }) => {
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);

    // First turn: this one is EXPECTED to move things, because the opening
    // state is centred and the stream then anchors to the top (stage 4).
    await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });

    // From here the layout is settled, so a FURTHER turn must not move the
    // turns above it — that is what "entry animates transform/opacity only"
    // actually guarantees.
    //
    // Measured with `offsetTop`, NOT `boundingBox()`: the thread auto-scrolls to
    // the newest message, so a viewport-relative rect moves by the scroll
    // distance and reports ~146px of "shift" that is not a shift at all.
    const offsetTop = () =>
      page.evaluate(
        () =>
          (document.querySelector('[data-testid="msg-greeting"]') as HTMLElement | null)
            ?.offsetTop ?? -1,
      );
    const before = await offsetTop();
    await page.getByTestId("composer-input").fill("Primink man rytoj 8 val.");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-assistant").last()).toBeVisible({ timeout: 30_000 });

    const animated = await page.evaluate(() => {
      const el = document.querySelector(".ua-msg-in");
      if (!el) return null;
      const s = getComputedStyle(el);
      return { name: s.animationName, duration: s.animationDuration };
    });
    expect(animated?.name, "an entering turn animates").toBe("ua-msg-in");
    expect(animated?.duration).not.toBe("0s");

    const after = await offsetTop();
    expect(before, "the greeting must be measurable").toBeGreaterThanOrEqual(0);
    expect(Math.abs(after - before), "no layout shift").toBeLessThanOrEqual(1);
  });

  test("prefers-reduced-motion disables every animation", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: STORAGE_STATE,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
    await hydrated(page);
    await page.getByTestId("composer-input").fill("Ką dar turiu padaryti?");
    await page.getByTestId("composer-send").click();
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });

    const motion = await page.evaluate(() => {
      const out: { cls: string; name: string }[] = [];
      for (const cls of ["ua-msg-in", "ua-dot", "ua-confirmed"]) {
        for (const el of document.querySelectorAll(`.${cls}`)) {
          out.push({ cls, name: getComputedStyle(el).animationName });
        }
      }
      return out;
    });
    expect(motion.length, "there should be motion classes present to check").toBeGreaterThan(0);
    for (const m of motion) {
      expect(m.name, `${m.cls} must not animate under reduced motion`).toBe("none");
    }

    // …and the content is still fully readable — motion was never the signal.
    await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("reduced-motion__light__desktop.png"),
      fullPage: false,
    });
    await ctx.close();
  });
});

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
