import {
  HomeBecauseView,
  HomeOutsideView,
  HomeRunningView,
  HomeWaitingView,
} from "@/components/app/home/home-regions";
import {
  deriveBecause,
  deriveOutside,
  deriveRunning,
  deriveWaiting,
  type WaitingRegion,
} from "@/lib/home/home-state";
import type { ActiveLocale } from "@/lib/i18n/config";
import type { NotificationEventRow } from "@/lib/notifications/events";
import type { TodayDoorKind, TodayGrowth, TodayOpenItems, TodayWork } from "@/lib/today/today-model";

/**
 * HOME STATES — DEVELOPMENT EVIDENCE (never served in production: the route
 * 404s there, see `design-proof-not-in-production.test.ts`).
 *
 * Renders the REAL region views (`components/app/home/home-regions.tsx`) with
 * states built through the REAL pure model, so layout, mobile composition and
 * the honest states (rich / light / unreadable / partly unreadable) can be
 * reviewed in a browser without a database. It is component proof, not
 * real-account proof: the data is constructed here and labelled as such.
 */

export type HomeProofState = "rich" | "light" | "unknown" | "partial";

const ev = (id: string, eventType: string, entityType: string, createdAt: string): NotificationEventRow =>
  ({ id, eventType, entityType, entityId: `e-${id}`, createdAt, readAt: null, metadata: {} }) as unknown as NotificationEventRow;

const WORK_RICH: TodayWork = {
  kind: "known",
  today: { hours: 6.5, entries: 2, untimed: 1 },
  week: { hours: 31, entries: 9, untimed: 1 },
  truncated: false,
};
const WORK_LIGHT: TodayWork = {
  kind: "known",
  today: { hours: 0, entries: 0, untimed: 0 },
  week: { hours: 0, entries: 0, untimed: 0 },
  truncated: false,
};
const GROWTH_RICH = {
  kind: "direction",
  direction: { kind: "core_strength", slug: "tiling", why: { attributedHours: 212, share: 0.46 } },
} as unknown as TodayGrowth;

const OPEN_RICH: TodayOpenItems = {
  kind: "known",
  items: [
    { kind: "offers", count: 2, href: "/dashboard/bookings" },
    { kind: "invitations", count: 1, href: "/dashboard/network" },
    { kind: "unread", count: 3, href: "/dashboard/communication" },
  ],
};

const EVENTS_RICH: NotificationEventRow[] = [
  ev("1", "engagement_created", "engagement", "2026-10-04T09:00:00Z"),
  ev("2", "booking_accepted", "booking_request", "2026-10-03T09:00:00Z"),
  ev("3", "absence_approved", "worker_absence", "2026-10-02T09:00:00Z"),
  ev("4", "message_received", "conversation", "2026-10-02T08:00:00Z"),
  ev("5", "weekly_digest", "weekly_digest", "2026-09-30T08:00:00Z"),
];

function build(state: HomeProofState) {
  const next = { kind: "action", dim: "availability", href: "/dashboard?result=player-card", whyKey: "why.availability", stale: false } as const;
  switch (state) {
    case "rich":
      return {
        waiting: deriveWaiting(next, OPEN_RICH),
        unknownDoors: [] as TodayDoorKind[],
        running: deriveRunning(
          WORK_RICH,
          [
            { projectId: "p1", title: "Harbour Quarter fit-out, building C, second-floor tiling and waterproofing", city: "Klaipėda" },
            { projectId: "p2", title: null, city: null },
          ],
          GROWTH_RICH,
        ),
        because: deriveBecause(EVENTS_RICH),
        outside: deriveOutside({
          kind: "bands",
          counts: { strong: 2, possible: 3, missing_requirement: 0, conflict: 0, not_assessed: 0 },
          more: 4,
          discoveryOnly: false,
        }),
      };
    case "light":
      return {
        waiting: deriveWaiting({ kind: "unknown" }, { kind: "known", items: [] }),
        unknownDoors: [] as TodayDoorKind[],
        running: deriveRunning(WORK_LIGHT, [], { kind: "none" }),
        because: deriveBecause([]),
        outside: deriveOutside({ kind: "none" }),
      };
    case "unknown":
      return {
        waiting: deriveWaiting({ kind: "unknown" }, { kind: "unknown" }),
        unknownDoors: ["offers", "invitations", "unread"] as TodayDoorKind[],
        running: deriveRunning({ kind: "unknown" }, null, { kind: "unknown" }),
        because: deriveBecause(null),
        outside: deriveOutside({ kind: "unknown" }),
      };
    case "partial":
      return {
        waiting: deriveWaiting(next, { kind: "known", items: [{ kind: "invitations", count: 1, href: "/dashboard/network" }] }) as WaitingRegion,
        unknownDoors: ["offers"] as TodayDoorKind[],
        running: deriveRunning(WORK_RICH, null, { kind: "unknown" }),
        because: deriveBecause([ev("1", "message_received", "conversation", "2026-10-04T09:00:00Z")]),
        outside: deriveOutside({ kind: "unavailable" }),
      };
  }
}

export async function HomeProof({ state, locale }: { readonly state: HomeProofState; readonly locale: ActiveLocale }) {
  const m = build(state);
  return (
    <div data-testid="home-proof" data-state={state} className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <p className="text-support text-text-muted" data-proof-banner>
        COMPONENT PROOF — constructed data through the real home model and the real region views. Not a real account.
        State: <strong>{state}</strong>
      </p>
      <HomeWaitingView locale={locale} region={m.waiting} unknownDoors={m.unknownDoors} />
      <HomeRunningView locale={locale} running={m.running} />
      <HomeBecauseView locale={locale} because={m.because} />
      <HomeOutsideView outside={m.outside} />
    </div>
  );
}
