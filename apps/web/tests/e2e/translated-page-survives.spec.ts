import { test, expect } from "@playwright/test";

/**
 * A PAGE THE BROWSER TRANSLATES (2026-11-05 production incident): the shim in
 * `lib/compat/translated-dom-shim.ts` must reach a real browser on a built page,
 * before any deploy. Same DOM calls React makes after a translator has replaced
 * a text node. The person's whole path is the `availability-save` production walk.
 */
test("an update beside a translated text node doesn't throw", async ({ page }) => {
  await page.goto("/en");
  const outcome = await page.evaluate(() => {
    const parent = document.createElement("button");
    const label = document.createTextNode("Save");
    parent.appendChild(label);
    const font = document.createElement("font");
    font.textContent = "Save";
    parent.replaceChild(font, label);
    const spinner = document.createElement("span");
    const errors: string[] = [];
    try {
      parent.insertBefore(spinner, label);
    } catch (e) {
      errors.push(`insert: ${(e as Error).name}`);
    }
    try {
      parent.removeChild(label);
    } catch (e) {
      errors.push(`remove: ${(e as Error).name}`);
    }
    return { errors, spinnerIn: spinner.parentNode === parent, fontIn: font.parentNode === parent };
  });
  expect(outcome).toEqual({ errors: [], spinnerIn: true, fontIn: true });
});
