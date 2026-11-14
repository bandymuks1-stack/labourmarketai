import type { Page } from "@playwright/test";

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
  const toggle = page.getByTestId("context-panel-toggle").filter({ visible: true }).first();
  if ((await toggle.count()) === 0) return; // a desktop, or a page without the panel
  const expanded = (await toggle.getAttribute("aria-expanded")) === "true";
  if (expanded === (want === "open")) return;
  await toggle.click();
}
