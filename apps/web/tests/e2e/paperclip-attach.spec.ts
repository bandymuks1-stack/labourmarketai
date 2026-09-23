import { test, expect, type FileChooser, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";

import { chooseWorkContextIfAsked } from "./worklog-context";

/**
 * THE PAPERCLIP ATTACHES A FILE (owner P0 2026-09-23, CASE 5/6/7/8).
 *
 * What the owner hit:
 *   - the paperclip opened a Work Journal photo form instead of a file picker;
 *   - several clicks stacked several "Kam skirtas šis failas?" questions (and,
 *     in work-log context, several independently savable forms);
 *   - the "Ką dirbai" field visibly held text while a red line said the work
 *     was not described — the form refused text the server would take.
 *
 * The contract this spec walks: ONE click opens a real file chooser; the
 * picked file shows at once as ONE pending chip; the chat asks ONCE; the work
 * photo answer opens the work-log form with the photo already in it; a
 * no-signal sentence ("Buvau objekte") saves after the explicit confirm; and
 * the save writes exactly one entry.
 *
 * Local stack only (dev fixtures + `pnpm e2e:local`), skips cleanly without it.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;
const LOCAL_STACK = !!process.env.E2E_LOCAL_STACK;
const DB_CONTAINER = "supabase_db_labourmarketai";

const WORKER = { email: "dev.worker@local.test", password: "password" };

/** A real 1×1 PNG — the file the OS picker hands over. */
const PNG = {
  name: "objektas.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
};

const QUESTION = "Kam skirtas šis failas?";

async function loginAsWorker(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(WORKER.email);
  await page.locator('input[type="password"]').fill(WORKER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 120_000, waitUntil: "domcontentloaded" });
}

/** The attach button is inert until React attaches — prove interactivity the
 *  same way the send button does (it enables only once React holds text). */
async function waitForHydratedComposer(page: Page): Promise<void> {
  const composer = page.getByTestId("composer-input").first();
  await composer.waitFor({ state: "visible", timeout: 120_000 });
  const send = page.getByTestId("composer-send").first();
  await expect(async () => {
    await composer.fill("x");
    await expect(send).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  await composer.fill("");
}

/** Bounded, loud DB read — only on a local stack run. */
function sql(query: string): string | null {
  const res = spawnSync(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qtA", "-c", query],
    { encoding: "utf8" },
  );
  if (res.error || res.status !== 0) {
    console.log(`[sql] FAILED status=${res.status} stderr=${(res.stderr ?? "").slice(0, 300)}`);
    return null;
  }
  return (res.stdout ?? "").trim();
}

async function journalCount(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/journal", { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.getByTestId("journal-entries").waitFor({ state: "attached", timeout: 180_000 });
  const count = page.getByTestId("journal-entries-count");
  if ((await count.count()) === 0) return 0;
  return Number((await count.textContent())?.trim() ?? "0");
}

test.describe("the paperclip attaches a file", () => {
  test.skip(!HAS_TEST_SUPABASE, "Needs the local Supabase stack (pnpm e2e:local).");
  test.describe.configure({ timeout: 300_000 });

  test("one click → file chooser → one chip, one question → work photo → one saved entry", async ({
    page,
  }) => {
    await loginAsWorker(page);
    const before = await journalCount(page);
    const startedAt = new Date().toISOString();

    await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydratedComposer(page);

    // ONE click opens a real file chooser — not a form.
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("composer-attach").first().click(),
    ]);
    expect(chooser.isMultiple()).toBe(false);
    await expect(page.getByTestId("worklog-flow")).toHaveCount(0);
    await chooser.setFiles(PNG);

    // The pick itself is the feedback: ONE pending chip with the file's name…
    await expect(page.getByTestId("composer-attachment")).toHaveCount(1);
    await expect(page.getByTestId("composer-attachment-name")).toHaveText(PNG.name);
    // …and exactly ONE question.
    await expect(page.getByText(QUESTION)).toHaveCount(1);

    // An image is a work photo or a certificate — never a CV.
    await expect(page.getByRole("button", { name: /^Mano gyvenimo aprašymas \(CV\)$/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Mano darbo nuotrauka$/ }).click();

    // The work-log form opens WITH the photo already in its own field.
    const flow = page.getByTestId("worklog-flow");
    const blocked = page.getByTestId("worklog-blocked");
    await expect(flow.or(blocked)).toBeVisible({ timeout: 120_000 });
    await expect(blocked, "worker fixture has no writable engagement context").toHaveCount(0);
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible({ timeout: 60_000 });
    // The file left the composer for the form.
    await expect(page.getByTestId("composer-attachment")).toHaveCount(0);

    // A sentence with no recognised time/place/activity: the server takes it,
    // so the form must too — no red line, a neutral hint at the confirm step.
    await page.getByTestId("worklog-notes").fill("Buvau objekte");
    await chooseWorkContextIfAsked(page);
    await page.getByTestId("worklog-save").click();
    await expect(page.getByTestId("worklog-error")).toHaveCount(0);
    await expect(page.getByTestId("worklog-confirm")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("worklog-no-signal-hint")).toBeVisible();
    await page.getByTestId("worklog-confirm").click();
    await expect(page.getByTestId("worklog-done")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId("worklog-photo-outcome")).toHaveAttribute(
      "data-photo-outcome",
      "uploaded",
    );

    // EXACTLY ONE new entry.
    expect(await journalCount(page), "one save = one entry").toBe(before + 1);
    if (LOCAL_STACK) {
      const rows = sql(
        `select count(*) from public.journal_entries where original_text = 'Buvau objekte' and created_at >= '${startedAt}';`,
      );
      expect(rows, "DB proof: exactly one row").toBe("1");
    }
  });

  test("a second pick while the form is open goes INTO that form — no second form, no second question", async ({
    page,
  }) => {
    await loginAsWorker(page);
    await waitForHydratedComposer(page);

    const [first] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("composer-attach").first().click(),
    ]);
    await first.setFiles(PNG);
    await page.getByRole("button", { name: /^Mano darbo nuotrauka$/ }).click();
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible({ timeout: 120_000 });

    const [second] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("composer-attach").first().click(),
    ]);
    await second.setFiles({ ...PNG, name: "objektas-2.png" });

    await expect(page.getByTestId("worklog-flow")).toHaveCount(1);
    await expect(page.getByText(QUESTION)).toHaveCount(1);
    await expect(page.getByTestId("composer-attachment")).toHaveCount(0);
    await expect(page.getByTestId("worklog-photo-preview")).toBeVisible();
  });

  test("double-clicking the paperclip still asks ONE question", async ({ page }) => {
    await loginAsWorker(page);
    await waitForHydratedComposer(page);

    const choosers: FileChooser[] = [];
    page.on("filechooser", (c) => choosers.push(c));
    await page.getByTestId("composer-attach").first().dblclick();
    await expect.poll(() => choosers.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // Answer EVERY chooser the double click produced — the worst case.
    for (const c of choosers) await c.setFiles(PNG);

    await expect(page.getByText(QUESTION)).toHaveCount(1);
    await expect(page.getByTestId("composer-attachment")).toHaveCount(1);
    await expect(page.getByTestId("worklog-flow")).toHaveCount(0);

    // Removing the file clears the question with it.
    await page.getByTestId("composer-attachment-remove").click();
    await expect(page.getByTestId("composer-attachment")).toHaveCount(0);
    await expect(page.getByText(QUESTION)).toHaveCount(0);
  });

  test("mobile 375px: the pending chip fits and its remove control is a real target", async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await loginAsWorker(page);
    await waitForHydratedComposer(page);

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("composer-attach").first().click(),
    ]);
    await chooser.setFiles({ ...PNG, name: `${"labai-ilgas-failo-pavadinimas-".repeat(4)}.png` });
    await expect(page.getByTestId("composer-attachment")).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal overflow at 375px").toBeLessThanOrEqual(0);
    const box = await page.getByTestId("composer-attachment-remove").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await context.close();
  });
});
