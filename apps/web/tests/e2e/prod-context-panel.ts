import { expect, type Page } from "@playwright/test";

/**
 * THE CONTEXT PANEL ON A PHONE.
 *
 * On a desktop the context panel is a column beside the conversation: what it holds
 * (an invitation to accept, a result, a need's close action) is simply on the page.
 * Below the `lg` breakpoint the same panel is a sheet at the bottom of the screen that
 * a person opens and closes with one button, `context-panel-toggle`. Closed, its body
 * is not displayed; open, it lies over the composer.
 *
 * A walk that runs on a phone therefore does what a person does: open the sheet before
 * using something inside it, close it before typing below it. On a desktop the button
 * is not shown, so both calls do nothing and the walk is exactly what it was. No
 * assertion is changed by this: the element a step looks for must still be visible.
 */
export async function contextPanel(page: Page, want: "open" | "closed"): Promise<void> {
  // Desktop: the panel is a column, the button is never shown (`lg:hidden`).
  if ((page.viewportSize()?.width ?? 0) >= LG) return;
  const toggle = page.getByTestId("context-panel-toggle").filter({ visible: true }).first();
  // A phone renders the button after the page settles; one immediate look
  // took "not there yet" for "no panel" and left the sheet closed.
  const shown = await toggle.waitFor({ state: "visible", timeout: TOGGLE_WAIT_MS }).then(
    () => true,
    () => false,
  );
  if (!shown) return; // a page without the panel
  const wanted = want === "open" ? "true" : "false";
  // A click before hydration does nothing: press until the sheet says so.
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== wanted) await toggle.click({ timeout: 5_000 });
    await expect(toggle).toHaveAttribute("aria-expanded", wanted, { timeout: 2_000 });
  }, `the context panel is ${want}`).toPass({ timeout: 30_000 });
}

/** Tailwind's `lg` breakpoint, where the panel becomes a column. */
const LG = 1024;
const TOGGLE_WAIT_MS = 15_000;
