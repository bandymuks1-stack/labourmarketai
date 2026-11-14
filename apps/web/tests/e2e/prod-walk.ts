import { test as base, devices, type BrowserContextOptions } from "@playwright/test";

import { WALK_TIME_ZONE, seedViewerTimeZone } from "./viewer-time-zone";
import { seedWalkAnalyticsConsent } from "./analytics-consent-seed";
import { WALK_PHONE, walkDevice, withWalkDevice } from "../../lib/testing/prod-qa-walk-device";

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
 * The same two doors also seed the analytics consent choice (refused unless
 * the walk sets its own), so the consent banner never covers a bottom CTA a
 * walk must press — see `analytics-consent-seed.ts`.
 *
 * THE DEVICE. `PROD_QA_DEVICE=phone` runs the same walk on a 390 px touch phone
 * through the same two doors: the default `context` / `page` get the phone as
 * their test options, and every `browser.newContext(...)` that names no screen
 * of its own gets it in the wrapper. A step that names its own viewport keeps
 * it — see `lib/testing/prod-qa-walk-device.ts`. Unset, nothing changes.
 *
 * Overriding the worker-scoped `browser` fixture gives these tests their own
 * workers, so no test that imports the plain `@playwright/test` ever sees the
 * wrapped browser. Nothing a walk asserts changes: the page a person sees after
 * the first-visit refresh is the page the walk now sees first.
 */
export * from "@playwright/test";

/**
 * THE ONE EXCEPTION to the consent seed: a context opened with
 * `firstVisit(...)` options is a browser that has never been here, so the walk
 * meets the real first-visit consent banner and must answer it itself (the
 * fresh-activation walk refuses it on the sign-up page). The time zone is
 * still seeded; only the consent choice is left unanswered.
 */
export const FIRST_VISIT = "lmFirstVisit" as const;
export type FirstVisitContextOptions = BrowserContextOptions & { readonly [FIRST_VISIT]?: true };
export function firstVisit(options: BrowserContextOptions = {}): FirstVisitContextOptions {
  return { ...options, [FIRST_VISIT]: true };
}

/** Read once per worker; an unknown value stops the walk before it opens anything. */
const DEVICE = walkDevice(process.env);
/** What a step with its own viewport runs as on a phone walk: the desktop browser, as on a desktop walk. */
const DESKTOP = { userAgent: devices["Desktop Chrome"].userAgent, deviceScaleFactor: devices["Desktop Chrome"].deviceScaleFactor };

export const test = base.extend({
  timezoneId: WALK_TIME_ZONE,
  ...(DEVICE === "phone" ? WALK_PHONE : {}),
  context: async ({ context }, use) => {
    await seedViewerTimeZone(context);
    await seedWalkAnalyticsConsent(context);
    await use(context);
  },
  browser: [
    async ({ browser }, use) => {
      const newContext = browser.newContext;
      browser.newContext = async (options?: FirstVisitContextOptions) => {
        const { [FIRST_VISIT]: unseeded, ...rest } = options ?? {};
        const ctx = await newContext.call(browser, { ...withWalkDevice(DEVICE, rest, DESKTOP), timezoneId: WALK_TIME_ZONE });
        await seedViewerTimeZone(ctx);
        if (!unseeded) await seedWalkAnalyticsConsent(ctx);
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
