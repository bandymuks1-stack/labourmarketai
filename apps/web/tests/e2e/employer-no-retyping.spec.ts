import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * "The employer must not type their need twice." — browser proof.
 *
 * THE DEFECT. /dashboard/market/recognize asked an employer to describe what
 * they need, recognised it, listed what was missing — and then handed over a
 * plain link to a demand wizard that opened EMPTY. The sentence was read,
 * scored, and dropped. The employer typed it again.
 *
 * Unit tests can prove the module writes the right draft. They cannot prove the
 * thing that actually failed: that a real person, in a real browser, sees their
 * own words arrive on the next screen. That is what this spec does, against the
 * LOCAL stack with the fixture company session:
 *
 *   1. type a need on the recognizer, press the hand-off;
 *   2. land on the demand form and find that need ALREADY in the description;
 *   3. confirm the row behind it is a DRAFT — nothing published, nothing
 *      matchable, nobody contacted;
 *   4. do it again in EN / RU / NL, because the point is that the need survives
 *      the language it was written in;
 *   5. and — the negative control, run FIRST — prove the wizard is genuinely
 *      empty when the employer did NOT come through the recognizer, so step 2
 *      is a measurement rather than a tautology.
 */

const expect = baseExpect.configure({ timeout: 15_000 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

const COMPANY_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002";
const DRAFT_QUERY = `customer_requests?profile_id=eq.${COMPANY_USER_ID}&kind=eq.company_request`;

/** Service-role REST helper that refuses anything which is not the local stack. */
async function db(method: "GET" | "DELETE", path: string): Promise<Response> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to touch a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
}

async function clearDrafts(): Promise<void> {
  await db("DELETE", DRAFT_QUERY);
}

/**
 * The demand wizard, scoped to `main`.
 *
 * A bare `getByTestId("demand-form")` is NOT stable here, and the reason is
 * worth writing down: React streams out-of-order Suspense content into a HIDDEN
 * container appended at the end of `<body>`, then moves it into place with an
 * inline script. For that window the same testid exists TWICE - once staged and
 * hidden, once real - and Playwright's strict mode fails on the ambiguity. It
 * fails intermittently, which is worse than failing every time. Scoping to
 * `main` names the one that is actually on the page.
 */
const demandForm = (page: Page) =>
  page.locator('main [data-testid="demand-form"]');
const demandDescription = (page: Page) =>
  page.locator('main [data-testid="demand-description"]');

type DraftRow = {
  status: string;
  title: string | null;
  payload: Record<string, unknown>;
};

async function readDrafts(): Promise<DraftRow[]> {
  const res = await db("GET", `${DRAFT_QUERY}&select=status,title,payload`);
  return (await res.json()) as DraftRow[];
}

/**
 * Describe a need on the recognizer and take the hand-off that carries it.
 * Every selector here is a testid the component actually renders — the
 * `recognizer-intent-*` and `recognizer-recognize` ids exist for this spec, so
 * it never has to guess at button order or visible copy in four languages.
 */
async function carryNeed(page: Page, locale: string, text: string) {
  await page.goto(`/${locale}/dashboard/market/recognize`);
  await page.getByTestId("offer-demand-recognizer").waitFor();
  await page.getByTestId("recognizer-intent-need_workers").click();
  await page.locator("#recognizer-input").fill(text);
  await page.getByTestId("recognizer-recognize").click();

  const handoff = page.getByTestId("recognizer-next-continue_to_demand");
  await expect(handoff).toBeVisible();
  // A BUTTON, not a link: it has to write the draft before it navigates.
  await expect(handoff).toHaveAttribute("data-carries-need-text", "yes");
  await handoff.click();

  await expect(page).toHaveURL(new RegExp(`/${locale}/dashboard/company`), {
    timeout: 40_000,
  });
  await demandForm(page).waitFor({ timeout: 40_000 });
}

/** The employer's need, in each language the pilot actually serves. */
const NEEDS: { locale: string; text: string }[] = [
  { locale: "lt", text: "Reikia 4 suvirintoju Vokietijoje nuo rugsejo" },
  { locale: "en", text: "We need 4 welders in Germany from September" },
  { locale: "ru", text: "Нужны 4 сварщика в Германии с сентября" },
  {
    locale: "nl",
    text: "Wij hebben 4 lassers nodig in Duitsland vanaf september",
  },
];

test.describe("the recognised need reaches the demand form", () => {
  test.skip(
    !HAS_LOCAL_STACK,
    "needs the local stack (pnpm -C apps/web e2e:local)",
  );
  test.use({
    storageState: "tests/e2e/.storage-state.company.json",
    viewport: { width: 1440, height: 900 },
  });
  test.setTimeout(180_000);
  test.describe.configure({ mode: "serial" });

  test.beforeEach(clearDrafts);
  test.afterAll(clearDrafts);

  /**
   * NEGATIVE CONTROL, and it runs FIRST on purpose. If the wizard were
   * pre-filled for some unrelated reason, every assertion below would pass while
   * proving nothing. This establishes the baseline the rest is measured against:
   * with no draft, the description box is EMPTY.
   */
  test("without the recognizer the demand form opens empty", async ({ page }) => {
    await page.goto("/lt/dashboard/company#demand-intake");
    await demandForm(page).waitFor({ timeout: 40_000 });
    await expect(demandDescription(page)).toHaveValue("");
  });

  for (const { locale, text } of NEEDS) {
    test(`[${locale}] the need typed on the recognizer arrives in the demand form`, async ({
      page,
    }) => {
      await carryNeed(page, locale, text);

      // THE MEASUREMENT: the employer's own sentence, on the next screen,
      // without typing it a second time.
      await expect(demandDescription(page)).toHaveValue(text, {
        timeout: 30_000,
      });

      // …and what stands behind it is a DRAFT, not a demand.
      const rows = await readDrafts();
      expect(rows.length, "exactly one draft, never an accumulating pile").toBe(
        1,
      );
      expect(rows[0].status).toBe("draft");
      expect(rows[0].payload.capabilities).toBe(text);
      // Never the em-dash placeholder a null title would have produced.
      expect(rows[0].title).toBeTruthy();
      expect(rows[0].title).not.toBe("—");
    });
  }

  /**
   * Idempotence in the browser, not only in the unit test. `save_demand_draft`
   * holds ONE draft per (profile, kind) behind a partial unique index, so a
   * second arrival must REPLACE the pending draft — an employer who reconsiders
   * must not end up with two pending needs.
   */
  test("arriving twice leaves exactly one draft", async ({ page }) => {
    await carryNeed(page, "lt", "pirmas poreikis: reikia suvirintoju");
    await carryNeed(page, "lt", "antras poreikis: reikia dazytoju");

    const rows = await readDrafts();
    expect(rows.length).toBe(1);
    expect(rows[0].payload.capabilities).toBe(
      "antras poreikis: reikia dazytoju",
    );
  });

  /**
   * A draft is not a demand — proven against the database rather than asserted
   * in prose. `submitted` is the only status the worker board and the matcher
   * read, and nothing carried here may reach it without the employer walking
   * the wizard and pressing create.
   */
  test("nothing carried here is ever submitted", async ({ page }) => {
    await carryNeed(page, "lt", "reikia 2 elektriku Vilniuje");

    const res = await db(
      "GET",
      `customer_requests?profile_id=eq.${COMPANY_USER_ID}&status=eq.submitted&select=id`,
    );
    expect(((await res.json()) as unknown[]).length).toBe(0);
  });
});
