import { test, expect } from "./prod-walk";
import { qaApi } from "./prod-qa-api";
import {
  NEED_WALK_MARK,
  needWalkAddress,
  needWalkCompany,
  needWalkDescription,
  needWalkRun,
} from "../../lib/testing/prod-qa-need-walk";

/**
 * PRODUCTION — ONE ANONYMOUS PUBLIC NEED (function register 4.8).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=need-intake),
 * dispatch only, never in the rotation: production synthetic submissions are
 * owner-dispatch only (owner decision 2026-10-28), and this one raises the
 * REAL internal owner alert — nothing here or in the product suppresses it.
 * Dispatching the walk is accepting that one alert, marked QA-SYNTHETIC.
 *
 *   N-1  a signed-out visitor fills /en/company-need and sends it after the
 *        form's own minimum fill time (no guard is bypassed); the page answers
 *        "received", which it shows only when the row was stored;
 *   N-2  nobody without the service key can read the row back: the public
 *        API refuses the table to an anonymous caller.
 *
 * What the walk writes: ONE row in `company_need_public_intakes`, status
 * `new`, company name and description marked QA-SYNTHETIC, contact address on
 * example.invalid (it can receive no mail, and no mail is sent on this path).
 * The need is never public at any status.
 *
 * The read-back with the service key and the change to `rejected` are NOT
 * here: a walk spec never holds a privileged key
 * (lib/guards/prod-qa-token-hygiene.test.ts). The workflow's next step,
 * `scripts/prod-qa-need-intake.ts`, does both and fails the job when the row
 * is missing, unmarked or not rejected. The row itself stays: the service
 * role cannot delete from that table. The owner removes it with
 * `docs/qa/need-intake-walk-cleanup.sql`.
 */
const ENABLED = process.env.PROD_QA_WALK === "1" && process.env.PROD_QA_NEED_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with spec=need-intake");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const RUN = needWalkRun();

test("N-1 (4.8). a signed-out visitor sends one marked need and the page says it was received", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "en-GB" });
  const page = await ctx.newPage();
  try {
    await page.goto("/en/company-need");
    const form = page.getByTestId("company-need-form");
    await expect(form, "the public form renders without an account").toBeVisible({ timeout: 30_000 });
    // A send before hydration is stored marked `?review=no-js`. This walk is
    // the JavaScript visitor, so it waits until hydration wrote the fill time.
    await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
      timeout: 60_000,
    });

    await form.locator('input[name="company_name"]').fill(needWalkCompany(RUN));
    await form.locator('input[name="contact_person"]').fill(`${NEED_WALK_MARK} contact`);
    await form.locator('input[name="contact_email"]').fill(needWalkAddress(RUN));
    // The first real work category the form offers (the list is the product's).
    const profession = form.locator('select[name="profession"]');
    const firstValue = await profession
      .locator("option")
      .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== "") ?? "");
    expect(firstValue, "the form offers at least one work category").not.toBe("");
    await profession.selectOption(firstValue);
    await form.getByTestId("company-need-country").selectOption("LT");
    await form.locator('input[name="number_of_workers"]').fill("1");
    await form.locator('textarea[name="description"]').fill(needWalkDescription(RUN));
    // The form's spam guard refuses a send inside 3 s of the fill time the
    // page stamped at hydration. The walk waits until that stamp is 3.5 s old,
    // like a person still typing; it reads the hidden stamp and never edits it.
    await page.waitForFunction(
      () => {
        const started = Number((document.querySelector('input[name="started"]') as HTMLInputElement | null)?.value ?? "");
        return Number.isFinite(started) && started > 0 && Date.now() - started >= 3_500;
      },
      undefined,
      { timeout: 30_000 },
    );
    await form.getByTestId("company-need-submit").click();

    const result = page.getByTestId("company-need-result");
    await expect(result, "the form answers the visitor").toBeVisible({ timeout: 60_000 });
    // The answer's body is marked "received" only for a stored row; a refused
    // or failed send is marked "prepared", with the same friendly wording
    // around it. The mark is computed in the component, so it is read as an
    // attribute here.
    await expect(result.locator("div[data-testid]").first(), "the need was stored, not only prepared").toHaveAttribute(
      "data-testid",
      "company-need-received",
    );
  } finally {
    await ctx.close();
  }
});

test("N-2 (4.8). the stored need is not readable through the public API", async () => {
  const r = await qaApi(
    `/rest/v1/company_need_public_intakes?select=id&contact_email=eq.${encodeURIComponent(needWalkAddress(RUN))}`,
    null,
  );
  const rows = r.status === 200 ? ((await r.json()) as unknown[]) : [];
  expect([200, 401, 403, 404], "the public API answers without a server error").toContain(r.status);
  expect(rows, "an anonymous caller is given no row").toEqual([]);
});
