import type { Role } from "@/lib/auth/actions";
import { buildNavBadges, getSpineCounts } from "@/lib/notifications/spine";
import { buildSpineNotifications } from "@/lib/notifications/spine-signals";
import { SpineHydrator } from "@/components/app/spine-hydrator";

/**
 * Streamed notification spine (P0 auth/dashboard performance repair).
 *
 * Production evidence 2026-07-19: the spine batch (8 derived-signal
 * helpers, the slowest being the full job-recommendation model) took
 * 850–1290 ms and GATED the dashboard layout's TTFB on EVERY authed
 * navigation. The shell now renders immediately; this async server
 * component resolves the SAME single spine source inside a Suspense
 * boundary and hydrates the auth context when ready — bell + badges
 * appear as soon as they are known, typically well under a second
 * later, without blocking first paint.
 *
 * Honesty invariants preserved: ONE spine source (`getSpineCounts`),
 * notifications derived by `buildSpineNotifications` (never a
 * hardcoded list), badges derived by `buildNavBadges` (only signals
 * whose surface clears them). Guard-pinned by
 * lib/guards/notification-spine.test.ts.
 */
export async function SpineStream({ activeRole }: { activeRole: Role | null }) {
  const spineCounts = await getSpineCounts();
  const navBadges = buildNavBadges(spineCounts);
  const notifications = buildSpineNotifications(
    spineCounts,
    activeRole ?? "worker",
  );
  return <SpineHydrator notifications={notifications} badges={navBadges} />;
}
