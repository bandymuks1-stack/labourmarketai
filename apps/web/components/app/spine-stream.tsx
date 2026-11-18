import type { Role } from "@/lib/auth/actions";
import {
  buildNavBadges,
  getDurableNotifications,
  getSpineCounts,
} from "@/lib/notifications/spine";
import {
  buildSpineNotifications,
  durableNotificationRole,
} from "@/lib/notifications/spine-signals";
import {
  maybeEmitJobAlertsInBackground,
  maybeEmitWeeklyDigestInBackground,
} from "@/lib/notifications/event-emitters";
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
  // [perf] the streamed spine holds the HTML document open until it resolves
  // (every dashboard page carries it). Production 2026-10-15: right after a
  // deploy, documents arrived in 0.4–0.7 s TTFB but finished only after
  // 25–44 s. These two numbers say whether this boundary is where that time
  // goes. Durations only — no identity, no counts.
  const spineStart = Date.now();
  const timed = <T,>(p: Promise<T>): Promise<{ v: T; ms: number }> =>
    p.then((v) => ({ v, ms: Date.now() - spineStart }));
  const [counts, durableRead] = await Promise.all([
    timed(getSpineCounts()),
    // Durable events (owner-gated store; [] until applied). Stored facts with
    // real timestamps and a persisted read state — NOT derived counts.
    timed(getDurableNotifications()),
  ]);
  const spineCounts = counts.v;
  const durable = durableRead.v;
  console.info("[perf] spine-stream", { ms: Date.now() - spineStart, counts_ms: counts.ms, durable_ms: durableRead.ms });
  const navBadges = buildNavBadges(spineCounts);
  const derived = buildSpineNotifications(spineCounts, activeRole ?? "worker");
  // Weekly personal digest — materialized read-time, at most once per ISO
  // week (skip check on the feed just fetched; UNIQUE dedupe key is the
  // authority). DELIBERATELY DETACHED (TRAIN 10 decision): this is a render
  // path, so an await would gate the spine on a notification insert — and a
  // digest insert killed by the serverless freeze self-heals, because every
  // later visit this week re-derives it and the dedupe key keeps it
  // exactly-once. Write-path emitters are awaited instead; see the
  // READ-TIME DETACHED notes in lib/notifications/event-emitters.ts.
  maybeEmitWeeklyDigestInBackground(durable);
  // Job alerts (stream N): real active jobs that fit the worker's own stated
  // profession + countries + salary, exactly-once per job revision. Detached
  // for the same reason as the digest above.
  maybeEmitJobAlertsInBackground();
  // Durable rows render under the SAME bell — one attention surface, two
  // honest row kinds. They clear by marking read (`durable: true`), and they
  // ALSO carry the surface their entity lives on (`href`), so "your absence
  // was rejected" is something you can act on rather than only read. Those two
  // facts are independent; the panel keys mark-all-read off `durable`, never
  // off a missing href. The role comes from `durableNotificationRole`: an
  // organization-side event never asks an employer to switch to worker, and
  // an event that can reach either side follows the active role.
  const durableRows: Notification[] = durable.map((d) => ({
    id: d.id,
    role: durableNotificationRole(d.type, activeRole),
    type: d.type,
    // The stored row's own safe render hints travel to the bell (owner
    // window 11 §28). Two events of the same type were indistinguishable
    // because everything except the type label was dropped here.
    payload: { ...d.metadata },
    read_at: d.read_at,
    created_at: d.created_at,
    href: d.href,
    durable: true,
  }));
  return (
    <SpineHydrator
      notifications={[...durableRows, ...derived]}
      badges={navBadges}
    />
  );
}
