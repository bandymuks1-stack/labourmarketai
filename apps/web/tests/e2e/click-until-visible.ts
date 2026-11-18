/**
 * One helper for a click whose effect is client-side state (a panel, a
 * disclosure, a mode switch): click `trigger` until `target` is visible.
 *
 * Why it exists: a click that lands before hydration does nothing — the
 * button's handler is not attached yet, so the open state never flips and the
 * next element never appears. A single click followed by an expect is then a
 * timing lottery (learning-practice L-8, skills-chain K-7). This helper retries
 * the click, bounded by `timeout`, and only while `target` is still hidden, so
 * it never toggles an already opened target shut.
 *
 * Rule for every e2e spec (lib/guards/e2e-click-until-visible.test.ts): do not
 * write a local copy of this loop; import it. Timeouts are the caller's own —
 * this helper never lengthens them.
 */
import { expect, type Locator } from "@playwright/test";

export type ClickUntilVisibleOptions = {
  /** Total budget for all attempts, ms. */
  readonly timeout?: number;
  /** Budget for one click and one visibility check, ms. */
  readonly attemptTimeout?: number;
  /** Runs before each click while `target` is hidden — e.g. re-open a native
   *  <details> that a row re-render closed again. */
  readonly prepare?: () => Promise<void>;
  /** What the click should open, for the failure message. */
  readonly what?: string;
};

export async function clickUntilVisible(
  trigger: Locator,
  target: Locator,
  { timeout = 60_000, attemptTimeout = 5_000, prepare, what }: ClickUntilVisibleOptions = {},
): Promise<void> {
  let clicks = 0;
  try {
    await expect(async () => {
      if (!(await target.isVisible().catch(() => false))) {
        if (prepare) await prepare();
        clicks += 1;
        await trigger.click({ timeout: attemptTimeout });
      }
      await expect(target).toBeVisible({ timeout: attemptTimeout });
    }).toPass({ timeout });
  } catch (cause) {
    throw new Error(
      `${what ?? "the target"} never appeared: ${clicks} click(s) on ${String(trigger)} within ${timeout} ms; ${String(target)} stayed hidden`,
      { cause },
    );
  }
}
