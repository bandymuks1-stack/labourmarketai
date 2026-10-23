import type { BrowserContext } from "@playwright/test";

/**
 * A walk's browser already knows its time zone, as a returning person's does.
 *
 * `ViewerTimeZone` (app/[locale]/layout.tsx) writes the `lm_tz` cookie on the
 * first page a browser opens and then refreshes that page once, so the
 * figures already rendered are re-read in the person's own frame. A real
 * person pays that once per browser. A production walk opens a FRESH context
 * for nearly every step, so it paid it on every step: one extra full server
 * render of the step's first page (prod-qa brigade walk 2026-10-22, run
 * 39795574869: ~19 of the walk's ~73 dashboard renders, most of them the
 * heaviest page, /dashboard/company/people).
 *
 * The context is created in a FIXED zone and carries the matching cookie
 * before its first request, so the server's first render is already in the
 * viewer's frame and the client finds nothing to correct. Nothing the walk
 * asserts changes: the page a person sees after the refresh is the page the
 * walk now sees first.
 */
export const WALK_TIME_ZONE = "Europe/Vilnius";

export function walkTimeZoneOptions(): { timezoneId: string } {
  return { timezoneId: WALK_TIME_ZONE };
}

export async function seedViewerTimeZone(ctx: BrowserContext): Promise<void> {
  const url = process.env.E2E_BASE_URL ?? "https://labourmarket.ai";
  await ctx.addCookies([
    { name: "lm_tz", value: encodeURIComponent(WALK_TIME_ZONE), url, sameSite: "Lax" },
  ]);
}
