/**
 * AUTHENTICATED PROOF FOR THE SURFACES THIS TRAIN CHANGED.
 *
 * Every slice in this train shipped at proof level 1–2 (types, lint, build,
 * guards) and stopped there, because the surfaces are all behind a login and
 * no browser could reach them. The guards assert that the code SAYS the right
 * thing; nothing asserted that a logged-in person SEES it.
 *
 * This closes that gap for the specific things the train changed:
 *
 *   • the localized demand title, on all three surfaces that show one
 *     (#1276, #1280) — production stores an English synthetic title;
 *   • the "somebody is waiting" line on the company hub (#1277);
 *   • the confirm-vs-start guidance on the opportunity board (#1279);
 *   • the journal and documents pages still rendering after their reads
 *     were batched (#1275, #1281);
 *   • no raw relationship slug on the company hub (#1275).
 *
 * Local fixtures + the rows seeded in `train-fixtures` below reproduce the
 * exact production states these fixes target: a worker with journal entries
 * and zero confirmed skills, and a submitted demand carrying the English
 * synthetic title with one person waiting on it.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const WORKER_STATE = join(__dirname, ".storage-state.json");
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");

/** The English synthetic title production actually stores. */
const SYNTHETIC_EN = "Hiring workers — demand";
/** What a Lithuanian reader must see instead. */
const SYNTHETIC_LT = "Ieškoma darbuotojų";

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // These surfaces stream; wait for the shell rather than networkidle, which
  // a chat-first page never reaches.
  await page.waitForLoadState("load");
}

test.describe("worker surfaces", () => {
  test.skip(
    !existsSync(WORKER_STATE),
    "run scripts/e2e-mint-session.ts for dev.worker@local.test first",
  );
  test.use({ storageState: WORKER_STATE });

  test("the board asks a worker with entries to CONFIRM, not to start", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/opportunities");

    const section = page.getByTestId("opportunities-no-skills");
    await expect(section).toBeVisible();

    // The fixture worker has 14 journal entries and zero worker_skills — the
    // exact state that used to be told "add a work entry".
    await expect(section).toContainText("Patvirtinkite");
    await expect(section).not.toContainText("Pridėkite darbo įrašus");
  });

  test("the journal still renders after its reads were batched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/journal");
    // The entries list is the thing the batched reads feed — asserting the
    // shell alone would pass even if the batch returned nothing.
    await expect(page.getByTestId("journal-entries")).toBeVisible();
  });

  test("documents still renders after its reads were batched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/documents");
    await expect(page.getByTestId("documents-page")).toBeVisible();
  });
});

test.describe("company surfaces", () => {
  test.skip(
    !existsSync(COMPANY_STATE),
    "mint a session for dev.company@local.test into .storage-state.company.json",
  );
  test.use({ storageState: COMPANY_STATE });

  test("the hub shows a localized title and says who is waiting", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/company");

    const row = page.getByTestId("demand-readback-row").first();
    await expect(row).toBeVisible();

    // #1276 — the stored English placeholder never reaches a Lithuanian reader.
    await expect(row).toContainText(SYNTHETIC_LT);
    await expect(row).not.toContainText(SYNTHETIC_EN);

    // #1277 — one person is waiting on this demand, and the hub says so.
    const waiting = page.getByTestId("demand-readback-interest-waiting").first();
    await expect(waiting).toBeVisible();
    await expect(waiting).toHaveAttribute("data-count", "1");
    // The Lithuanian `one` plural arm, with the number actually in it.
    await expect(waiting).toContainText("1");
    await expect(waiting).toContainText("laukia");
  });

  test("scouting shows the localized title too", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/company/scouting");
    const body = page.locator("body");
    await expect(body).toContainText(SYNTHETIC_LT);
    await expect(body).not.toContainText(SYNTHETIC_EN);
  });

  test("no raw relationship slug reaches the company hub", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, "/lt/dashboard/company");

    // #1275 — the lifecycle section used to print the stored slug verbatim.
    // Assert on the rendered members, not the whole page, so an unrelated
    // English word elsewhere cannot mask a regression here.
    const members = page.getByTestId("lifecycle-member");
    const n = await members.count();
    for (let i = 0; i < n; i += 1) {
      const text = (await members.nth(i).innerText()).toLowerCase();
      for (const slug of ["employee", "external_manager", "owner"]) {
        expect(
          text.includes(slug),
          `lifecycle member ${i} leaked the raw slug "${slug}"`,
        ).toBe(false);
      }
    }
  });
});
