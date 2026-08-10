import type { Role } from "@/lib/auth/actions";
import {
  buildNavBadges,
  getDurableNotifications,
  getSpineCounts,
} from "@/lib/notifications/spine";
import { buildSpineNotifications } from "@/lib/notifications/spine-signals";
import { SpineHydrator } from "@/components/app/spine-hydrator";
import type { Notification } from "@/lib/auth/context";

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
  const [spineCounts, durable] = await Promise.all([
    getSpineCounts(),
    // Durable events (owner-gated store; [] until applied). Stored facts with
    // real timestamps and a persisted read state — NOT derived counts.
    getDurableNotifications(),
  ]);
  const navBadges = buildNavBadges(spineCounts);
  const derived = buildSpineNotifications(spineCounts, activeRole ?? "worker");
  // Durable rows carry no href (they clear by marking read, not by visiting)
  // and render under the SAME bell — one attention surface, two honest row
  // kinds. The employer-outcome events get the company icon; the rest are
  // worker-facing.
  const durableRows: Notification[] = durable.map((d) => ({
    id: d.id,
    role:
      d.type === "event_booking_accepted" || d.type === "event_booking_declined"
        ? "company"
        : "worker",
    type: d.type,
    payload: {},
    read_at: d.read_at,
    created_at: d.created_at,
  }));
  return (
    <SpineHydrator
      notifications={[...durableRows, ...derived]}
      badges={navBadges}
    />
  );
}
