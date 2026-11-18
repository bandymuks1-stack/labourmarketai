import { expect, type Page } from "@playwright/test";

/**
 * EXACTLY-ONCE RENDER CHECK for a dashboard section, with the evidence needed
 * to name the cause when it fails.
 *
 * Since at least 2026-11-01 the isolated walks and the production J-2 walk
 * intermittently find a dashboard section TWICE on a full page load: one copy
 * inside <main>, one outside it (team-brigade, company-work-history,
 * account-notification-preferences, opportunities-list, doc-centre-org). The
 * page renders each of them once. Strict locators fail on it, but the failure
 * never said WHERE the second copy lives, so the cause stayed a guess.
 *
 * This records, for every copy: whether it is inside <main>, whether it sits
 * under a `hidden` element or a streamed segment (`S:` / `P:` ids that React
 * moves into place when a Suspense boundary completes), whether it is
 * visible, and its ancestor chain, plus the page's console errors (a React
 * hydration error such as #418 / #423 would show here). It counts twice: when
 * the copy in <main> first appears, and again once the network is idle.
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  return errors;
}

type Copy = {
  inMain: boolean;
  visible: boolean | null;
  hiddenAncestor: string | null;
  segment: string | null;
  path: string;
};

async function copies(page: Page, testId: string): Promise<Copy[]> {
  return page.$$eval(`[data-testid="${testId}"]`, (els) =>
    els.map((el) => {
      const path: string[] = [];
      for (let n: Element | null = el.parentElement; n && n !== document.body && path.length < 8; n = n.parentElement) {
        path.push(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${n.hasAttribute("hidden") ? "[hidden]" : ""}`);
      }
      const hidden = el.closest("[hidden]");
      const segment = el.closest('[id^="S:"], [id^="P:"], template');
      return {
        inMain: !!el.closest("main"),
        visible: typeof el.checkVisibility === "function" ? el.checkVisibility() : null,
        hiddenAncestor: hidden ? `${hidden.tagName.toLowerCase()}${hidden.id ? `#${hidden.id}` : ""}` : null,
        segment: segment ? segment.id || segment.tagName.toLowerCase() : null,
        path: path.join(" < "),
      };
    }),
  );
}

/** A copy inside React's hidden streamed segment (`<div hidden id="S:n">`, or a
 *  `P:` placeholder): the HTML of a Suspense boundary that has arrived but is
 *  not yet moved into place. It is invisible and React removes it on the swap,
 *  so it is in-flight markup, not a second render (seen on CI job 133249460893:
 *  `div#S:2[hidden]`, gone once settled, no console error). */
function inStreamedSegment(c: Copy): boolean {
  return c.visible !== true && !c.inMain && /#[SP]:/.test(c.hiddenAncestor ?? "");
}

export async function expectRenderedOnce(page: Page, testId: string, errors: readonly string[], where: string): Promise<void> {
  await expect(page.getByRole("main").getByTestId(testId).first(), `${where}: ${testId} is on the page`).toBeVisible({
    timeout: 30_000,
  });
  const early = await copies(page, testId);
  await page.waitForLoadState("networkidle").catch(() => {});
  let settled = await copies(page, testId);
  const evidence = () => JSON.stringify({ early, settled, consoleErrors: errors.slice(-10) });
  // As it appears: exactly one RENDERED copy. A copy still inside the hidden
  // streamed segment is recorded in the evidence, not counted.
  const rendered = early.filter((c) => !inStreamedSegment(c));
  expect(rendered.length, `${where}: ${testId} rendered ${rendered.length}× as it appeared — ${evidence()}`).toBe(1);
  // Settled: exactly one copy IN TOTAL, the in-flight segment included, so a
  // real double render (or a segment React never swapped in) still fails. The
  // swap can land just after network idle, hence a short poll.
  await expect
    .poll(
      async () => {
        settled = await copies(page, testId);
        return settled.length;
      },
      { message: `${where}: ${testId} once settled — ${evidence()}`, timeout: 10_000 },
    )
    .toBe(1);
  expect(settled[0]?.inMain, `${where}: the one settled copy is in <main> — ${evidence()}`).toBe(true);
}
