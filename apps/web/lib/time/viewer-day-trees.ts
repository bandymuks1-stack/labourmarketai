/**
 * WHICH PAGES READ THE VIEWER'S TIME ZONE (perf 2026-11-22).
 *
 * `lm_tz` is read only on the signed-in trees: the journal, planning, hours,
 * projects, the home page and the CV judge "today" in the viewer's own zone
 * (`lib/time/viewer-day.ts`). No public page reads it.
 *
 * `ViewerTimeZone` sits in the locale layout, so it runs on every page. On a
 * first visit it sets the cookie, and it used to call `router.refresh()` on
 * every page as well. That rendered each first public page view twice on the
 * server, for every new visitor, for nothing.
 *
 * The cookie is still set everywhere. The next request carries it. The page is
 * refreshed only where the figures already on screen depend on it.
 *
 * PURE: no fs / net / env.
 */
import { locales } from "@/lib/i18n/config";

const VIEWER_DAY_TREES = ["/dashboard", "/cv", "/onboarding"] as const;

/** `/lt/dashboard/journal` -> true; `/en/jobs` -> false; `/dashboard` -> true. */
export function pageReadsViewerDay(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const first = pathname.split("/")[1] ?? "";
  // Only a real locale prefix is dropped: "/cv" is a page, not a language.
  const rest = (locales as readonly string[]).includes(first) ? pathname.slice(first.length + 1) || "/" : pathname;
  return VIEWER_DAY_TREES.some((t) => rest === t || rest.startsWith(`${t}/`));
}
