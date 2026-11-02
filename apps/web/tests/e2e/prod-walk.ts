import { test as base, type BrowserContextOptions } from "@playwright/test";

import { WALK_TIME_ZONE, seedViewerTimeZone } from "./viewer-time-zone";

/**
 * THE PRODUCTION WALK'S `test` — every browser context it opens is a returning
 * browser that already knows its time zone (see `viewer-time-zone.ts` for why:
 * without it each fresh context paid one extra full server render of its first
 * page, ~19 of ~73 renders in the brigade walk).
 *
 * Every spec the production walk runs (`prod-*.spec.ts` and every spec named in
 * `.github/workflows/prod-qa-walk.yml`) imports `test` from HERE instead of
 * from `@playwright/test`; `lib/guards/prod-walk-viewer-time-zone.test.ts`
 * fails the build when one does not. `expect` and every type are re-exported
 * unchanged, so the import line is the only difference.
 *
 * ONE mechanism, three doors, all covered:
 *
 *  - the default `context` / `page` fixtures: the `timezoneId` option is set to
 *    WALK_TIME_ZONE and the `context` fixture is seeded with the `lm_tz` cookie
 *    before the `page` fixture (which depends on it) can open anything;
 *  - `browser.newContext(...)` and `browser.newPage(...)` in a spec or in any
 *    helper the spec hands its `browser` to: the worker's `browser` fixture is
 *    wrapped so every context it creates gets `timezoneId` = WALK_TIME_ZONE and
 *    the cookie before it is returned, i.e. before its first request.
 *    (`Browser.newPage` creates its context through `this.newContext`, so it
 *    takes the same path.)
 *
 * Playwright Test already merges test options such as `timezoneId` into
 * contexts made with `browser.newContext()` inside a test, but no option can
 * carry a cookie into a context that names its own `storageState` (each walk
 * step passes its minted session file). Hence the wrapper; it also re-asserts
 * the zone, so a context's zone and its cookie can never disagree.
 *
 * Overriding the worker-scoped `browser` fixture gives these tests their own
 * workers, so no test that imports the plain `@playwright/test` ever sees the
 * wrapped browser. Nothing a walk asserts changes: the page a person sees after
 * the first-visit refresh is the page the walk now sees first.
 */
export * from "@playwright/test";

export const test = base.extend({
  timezoneId: WALK_TIME_ZONE,
  context: async ({ context }, use) => {
    await seedViewerTimeZone(context);
    await use(context);
  },
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext;
      browser.newContext = async (options?: BrowserContextOptions) => {
        const ctx = await newContext.call(browser, { ...options, timezoneId: WALK_TIME_ZONE });
        await seedViewerTimeZone(ctx);
        return ctx;
      };
      try {
        await use(browser);
      } finally {
        browser.newContext = newContext;
      }
    },
    { scope: "worker" },
  ],
});
