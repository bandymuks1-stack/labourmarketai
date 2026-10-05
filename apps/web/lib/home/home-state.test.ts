import { describe, expect, it } from "vitest";

import { NOTIFICATION_EVENT_TYPES, type NotificationEventRow } from "@/lib/notifications/events";
import { deriveTodayModel, type TodayModel, type TodayOpportunity } from "@/lib/today/today-model";

import {
  CAUSAL_CHAINS,
  HOME_REGION_SHOWN,
  composeHomeState,
  deriveBecause,
  deriveOutside,
  deriveRunning,
  deriveWaiting,
  leadingRegion,
  regionHasContent,
} from "./home-state";

const ev = (id: string, eventType: string, createdAt: string, entityType = "engagement"): NotificationEventRow =>
  ({ id, eventType, entityType, entityId: `e-${id}`, createdAt, readAt: null, metadata: {} }) as unknown as NotificationEventRow;

/** Every reader unreadable: the real model with all inputs null. */
const ALL_UNKNOWN: TodayModel = deriveTodayModel({
  displayName: null,
  professionSlug: null,
  workCard: null,
  workIntelligence: null,
  growth: null,
  opportunities: null,
  attention: null,
});

const withToday = (patch: Partial<TodayModel>): TodayModel => ({ ...ALL_UNKNOWN, ...patch });

const BANDS: TodayOpportunity = {
  kind: "bands",
  counts: { strong: 1, possible: 0, missing_requirement: 0, conflict: 0, not_assessed: 0 },
  more: 0,
  discoveryOnly: false,
};

describe("home state — UNKNOWN is never ZERO", () => {
  it("every unreadable reader yields an unknown region, not an empty one", () => {
    const s = composeHomeState({ today: ALL_UNKNOWN, projects: null, events: null });
    expect(s.waiting.kind).toBe("unknown");
    expect(s.running.kind).toBe("unknown");
    expect(s.because.kind).toBe("unknown");
    expect(s.outside.kind).toBe("unknown");
    expect(leadingRegion(s)).toBeNull();
  });

  it("a readable-but-empty feed is a KNOWN empty region, distinct from unknown", () => {
    const s = composeHomeState({ today: ALL_UNKNOWN, projects: [], events: [] });
    expect(s.because).toEqual({ kind: "known", causes: [], events: [] });
    expect(s.because.kind).not.toBe("unknown");
    expect(regionHasContent(s, "because")).toBe(false);
  });

  it("waiting is unknown only when BOTH the next action and the doors failed", () => {
    expect(deriveWaiting({ kind: "unknown" }, { kind: "unknown" }).kind).toBe("unknown");
    expect(deriveWaiting({ kind: "unknown" }, { kind: "known", items: [] })).toEqual({ kind: "known", items: [] });
    const half = deriveWaiting(
      { kind: "action", dim: "availability", href: "/x", whyKey: "why.availability", stale: false },
      { kind: "unknown" },
    );
    expect(half.kind === "known" && half.items.map((i) => i.kind)).toEqual(["next"]);
  });

  it("running is unknown only when the journal AND the assignments both failed", () => {
    expect(deriveRunning({ kind: "unknown" }, null, { kind: "unknown" }).kind).toBe("unknown");
    expect(deriveRunning({ kind: "unknown" }, [], { kind: "unknown" }).kind).toBe("known");
    const r = deriveRunning({ kind: "unknown" }, [{ projectId: "p", title: "T", city: null }], { kind: "unknown" });
    expect(r.kind === "known" && r.projects?.length).toBe(1);
  });

  it("outside keeps none / no-worker / unavailable as distinct known answers; only unknown is unknown", () => {
    for (const kind of ["none", "no-worker", "unavailable"] as const) {
      expect(deriveOutside({ kind })).toEqual({ kind: "known", opportunity: { kind } });
    }
    expect(deriveOutside({ kind: "unknown" }).kind).toBe("unknown");
  });
});

describe("home state — the causal ledger is strict", () => {
  const SUPPORTED = Object.keys(CAUSAL_CHAINS);

  it("there are exactly the ten supported mappings", () => {
    expect(SUPPORTED).toHaveLength(10);
  });

  it.each(SUPPORTED)("%s yields exactly its own chain, as a cause", (type) => {
    const r = deriveBecause([ev("1", type, "2026-10-01T10:00:00Z")]);
    if (r.kind !== "known") throw new Error("expected known");
    expect(r.causes).toHaveLength(1);
    expect(r.events).toHaveLength(0);
    expect(r.causes[0].chain).toEqual(CAUSAL_CHAINS[type]);
    expect(r.causes[0].eventType).toBe(type);
  });

  it("every supported event type is a real notification event type (no stale mapping)", () => {
    for (const type of SUPPORTED) expect(NOTIFICATION_EVENT_TYPES).toContain(type);
  });

  it("NEGATIVE: every event type outside the closed map yields NO causal chain", () => {
    const unsupported = NOTIFICATION_EVENT_TYPES.filter((t) => !SUPPORTED.includes(t));
    expect(unsupported.length).toBeGreaterThan(0);
    for (const type of unsupported) {
      const r = deriveBecause([ev("1", type, "2026-10-01T10:00:00Z")]);
      if (r.kind !== "known") throw new Error("expected known");
      expect(r.causes, `${type} must not generate a cause`).toHaveLength(0);
      expect(r.events, `${type} stays a plain event`).toHaveLength(1);
      expect(r.events[0]).not.toHaveProperty("chain");
    }
  });

  it("NEGATIVE: an unknown event type never gets a chain, and neither does temporal proximity", () => {
    const r = deriveBecause([
      ev("1", "message_received", "2026-10-01T10:00:00Z", "conversation"),
      ev("2", "booking_accepted", "2026-10-01T10:00:01Z", "booking_request"),
      ev("3", "totally_new_event", "2026-10-01T10:00:02Z"),
    ]);
    if (r.kind !== "known") throw new Error("expected known");
    expect(r.causes.map((c) => c.eventType)).toEqual(["booking_accepted"]);
    expect(r.events.map((e) => e.eventType).sort()).toEqual(["message_received", "totally_new_event"]);
  });

  it("chain keys are stable i18n keys and a change never names a person it was not told", () => {
    for (const c of Object.values(CAUSAL_CHAINS)) {
      expect(c.consequenceKey).toMatch(/^[a-z][A-Za-z]+$/);
      expect(c.stateKey).toMatch(/^[a-z][A-Za-z]+$/);
    }
    const r = deriveBecause([ev("1", "engagement_created", "2026-10-01T00:00:00Z")]);
    expect(r.kind === "known" && r.causes[0].subject.label).toBeNull();
  });

  it("newest first, bounded, and carries read state", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ev(`b${i}`, "booking_accepted", `2026-10-0${i + 1}T00:00:00Z`));
    const r = deriveBecause(rows);
    expect(r.kind === "known" && r.causes.length).toBe(HOME_REGION_SHOWN);
    expect(r.kind === "known" && r.causes[0].id).toBe("b8");
  });
});

describe("home state — projection of the real model", () => {
  it("a person with a next action leads with WAITING", () => {
    const s = composeHomeState({
      today: withToday({ next: { kind: "action", dim: "location", href: "/x", whyKey: "why.location", stale: false } }),
      projects: [],
      events: [],
    });
    expect(leadingRegion(s)).toBe("waiting");
  });

  it("with nothing waiting, assigned projects lead with RUNNING", () => {
    const s = composeHomeState({
      today: withToday({ next: { kind: "unknown" }, openItems: { kind: "known", items: [] } }),
      projects: [{ projectId: "p", title: "Site", city: "Kaunas" }],
      events: [],
    });
    expect(leadingRegion(s)).toBe("running");
  });

  it("the market region has content only when the engine returned bands", () => {
    const s = composeHomeState({ today: withToday({ opportunity: BANDS }), projects: null, events: null });
    expect(regionHasContent(s, "outside")).toBe(true);
    expect(regionHasContent(composeHomeState({ today: withToday({ opportunity: { kind: "none" } }), projects: null, events: null }), "outside")).toBe(false);
  });

  it("an employer-shaped context with only some readers still composes", () => {
    const s = composeHomeState({ today: ALL_UNKNOWN, projects: [{ projectId: "p1", title: "  ", city: null }], events: [] });
    expect(s.running.kind).toBe("known");
    expect(s.waiting.kind).toBe("unknown");
    expect(leadingRegion(s)).toBe("running");
  });
});
