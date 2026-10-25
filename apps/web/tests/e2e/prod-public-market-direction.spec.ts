import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

/**
 * PRODUCTION — THE MARKET'S DIRECTION ON THE PUBLIC FRONT DOOR (registry row
 * 4.2 "Demand ≠ supply direction", owner separation SEP-4; no production walk
 * before 2026-10-25).
 *
 * A signed-out visitor types a sentence into the landing's entry box and the
 * page says what it understood. The reading is the production router itself
 * (`classifyIntent`, the same one the chat dispatches through —
 * lib/marketing/public-entry.ts owns no patterns), so this walk proves in the
 * real browser that the three directions of the market never collapse:
 *
 *   DEMAND     an organization asking FOR people or a crew   → find-workers / need-workers
 *   SUPPLY     a crew or company offering ITSELF              → offer-capacity
 *   INDIVIDUAL one person looking for work                    → find-work
 *
 * The sentences are the ones the unit guard pins
 * (lib/guards/a-brigade-can-offer-itself.test.ts) — this walk adds the proof
 * that the shipped page reads them the same way. LT, EN and RU, at 390 px AND
 * 1280 px; every reading must say something, in the page's own language, and
 * the page must not scroll sideways on the phone.
 *
 * FORBIDDEN (F-1): a signed-out visitor is sent to sign in from a company's
 * candidate list, and gets no journal file from the journal export route.
 *
 * Nothing is written: no session, no form submitted beyond the client-side
 * reading (the landing's own funnel counter records the reading, as it does
 * for every visitor). Logs carry intents and counts only.
 */
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

type Locale = "lt" | "en" | "ru";
type Direction = "demand" | "supply" | "individual";

const DIRECTION_INTENTS: Record<Direction, readonly string[]> = {
  demand: ["find-workers", "need-workers"],
  supply: ["offer-capacity"],
  individual: ["find-work"],
};

/** Pinned by lib/guards/a-brigade-can-offer-itself.test.ts (sections 1–3). */
const SENTENCES: Record<Locale, readonly { sentence: string; direction: Direction }[]> = {
  lt: [
    { sentence: "Ieskau brigados objektui", direction: "demand" },
    { sentence: "Ieskome darbo musu brigadai.", direction: "supply" },
    { sentence: "Ieskau darbo", direction: "individual" },
  ],
  en: [
    { sentence: "I need a crew for the site", direction: "demand" },
    { sentence: "Looking for work for our crew.", direction: "supply" },
    { sentence: "Find me a job", direction: "individual" },
  ],
  ru: [
    { sentence: "Нужна бригада из 6 сварщиков.", direction: "demand" },
    { sentence: "Ищем проект для нашей бригады.", direction: "supply" },
  ],
};

const BCP: Record<Locale, string> = { lt: "lt-LT", en: "en-GB", ru: "ru-RU" };
const WIDTHS = [
  { name: "390 px", viewport: { width: 390, height: 844 }, phone: true },
  { name: "1280 px", viewport: { width: 1280, height: 800 }, phone: false },
] as const;

async function visitor(browser: Browser, locale: Locale, width: (typeof WIDTHS)[number]): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    locale: BCP[locale],
    viewport: width.viewport,
    ...(width.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** Type one sentence into the landing's entry box the way a visitor does, and read the answer. */
async function readSentence(page: Page, sentence: string): Promise<{ intent: string; understood: string }> {
  const input = page.getByTestId("entry-input");
  const submit = page.getByTestId("entry-submit");
  // Hydration gate: the box accepts typing before React attaches, and the
  // button stays disabled until React holds the text — so "enabled" proves
  // React received THIS sentence. Retype until it is, then read the answer.
  // Cleared first: text typed before hydration stays in the box while React's
  // state is still empty, and re-filling the SAME value fires no change event
  // (measured on the local stack: the button stayed disabled for 70 s).
  const understanding = page.getByTestId("entry-understanding");
  await expect(async () => {
    await input.fill("");
    await input.fill(sentence);
    await expect(submit).toBeEnabled({ timeout: 3_000 });
    await submit.click({ timeout: 5_000 });
    await expect(understanding).toContainText(sentence, { timeout: 5_000 });
  }).toPass({ timeout: 90_000 });
  return {
    intent: (await understanding.getAttribute("data-intent")) ?? "",
    understood: (await understanding.locator("p").nth(2).innerText().catch(() => "")).trim(),
  };
}

for (const locale of ["lt", "en", "ru"] as const) {
  test(`D-${locale} (4.2). ${locale}: demand, supply and a job search are read as separate directions, at 390 and 1280 px`, async ({
    browser,
  }) => {
    const failures: string[] = [];
    for (const width of WIDTHS) {
      const { ctx, page } = await visitor(browser, locale, width);
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message.split("\n")[0].slice(0, 160)));
      try {
        const res = await page.goto(`/${locale}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        expect(res?.status() ?? 0, "the landing answers").toBeLessThan(400);
        expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe(locale);
        await expect(page.getByTestId("public-entry"), "the entry box is on the landing").toBeVisible({ timeout: 30_000 });
        for (const { sentence, direction } of SENTENCES[locale]) {
          const { intent, understood } = await readSentence(page, sentence);
          const ok = DIRECTION_INTENTS[direction].includes(intent);
          console.info(`[direction] ${locale} ${width.name} ${direction} → ${intent}${ok ? "" : " (WRONG)"}`);
          if (!ok) failures.push(`${locale} ${width.name}: "${sentence}" read as ${intent || "nothing"}, expected ${direction}`);
          if (understood.length === 0) failures.push(`${locale} ${width.name}: "${sentence}" was read but nothing was said`);
        }
        if (width.phone) {
          const { doc, body, inner } = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            inner: window.innerWidth,
          }));
          if (Math.max(doc, body) > inner + 1) failures.push(`${locale} ${width.name}: wider than the phone (${Math.max(doc, body)} > ${inner})`);
        }
        if (errors.length) failures.push(`${locale} ${width.name}: page errors: ${errors.join(" | ")}`);
      } finally {
        await ctx.close();
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
}

test("F-1. signed out: a company's candidate list sends to sign-in, and the journal export gives no file", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "lt-LT" });
  const page = await ctx.newPage();
  try {
    await page.goto("/lt/dashboard/company/scouting");
    await expect(page, "anonymous → sign-in").toHaveURL(/\/auth\/(login|sign-?in)/, { timeout: 30_000 });
    const res = await ctx.request.get("/lt/dashboard/journal/export", { maxRedirects: 0 });
    const location = res.headers()["location"] ?? "";
    const type = res.headers()["content-type"] ?? "";
    console.info(`[forbidden] anonymous journal export → HTTP ${res.status()}`);
    expect(
      res.status() === 401 || (res.status() >= 300 && res.status() < 400 && /\/auth\//.test(location)),
      `anonymous journal export is refused (HTTP ${res.status()})`,
    ).toBe(true);
    expect(type, "no CSV is served to an anonymous caller").not.toMatch(/text\/csv/);
  } finally {
    await ctx.close();
  }
});
