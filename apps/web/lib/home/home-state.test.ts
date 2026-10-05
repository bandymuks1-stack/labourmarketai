import { describe, expect, it } from "vitest";

import type { NotificationEventRow } from "@/lib/notifications/events";
import type { OpportunitiesResultMatch } from "@/lib/marketplace/worker-opportunities-contract";
import type { TodayAttention } from "@/lib/today/today-model";

import {
  CAUSAL_CHAINS,
  HOME_REGION_SHOWN,
  composeHomeState,
  deriveBecause,
  deriveOutside,
  deriveRunning,
  deriveWaiting,
  isWaitingPartial,
  leadingRegion,
} from "./home-state";

const ev = (id: string, eventType: string, createdAt: string, entityType = "engagement"): NotificationEventRow =>
  ({ id, eventType, entityType, entityId: `e-${id}`, createdAt, readAt: null, metadata: {} }) as unknown as NotificationEventRow;

const opp = (id: string, companyName: string | null = null): OpportunitiesResultMatch =>
  ({ requestId: id, companyName }) as unknown as OpportunitiesResultMatch;

const att = (o: Partial<TodayAttention> = {}): TodayAttention => ({
  offers: 0,
  invitations: 0,
  unread: { count: 0, onlyId: null },
  ...o,
});

describe("home state — UNKNOWN is never ZERO", () => {
  it("every unreadable reader yields an unknown region, not an empty one", () => {
    const s = composeHomeState({ attention: null, projects: null, today: null, events: null, opportunities: null });
    expect(s.waiting.kind).toBe("unknown");
    expect(s.running.kind).toBe("unknown");
    expect(s.because.kind).toBe("unknown");
    expect(s.outside.kind).toBe("unknown");
    expect(leadingRegion(s)).toBeNull();
  });

  it("all attention counters null is unknown; a readable zero is known-empty", () => {
    expect(deriveWaiting({ offers: null, invitations: null, unread: null }).kind).toBe("unknown");
    const empty = deriveWaiting(att());
    expect(empty).toEqual({ kind: "known", items: [], total: 0 });
  });

  it("a partial attention read reports what it read and flags partial", () => {
    const a = att({ offers: 2, invitations: null });
    const r = deriveWaiting(a);
    expect(r.kind === "known" && r.items.map((i) => i.titleKey)).toEqual(["offers"]);
    expect(isWaitingPartial(a)).toBe(true);
    expect(isWaitingPartial(att())).toBe(false);
  });

  it("running is unknown only when projects AND today are both unreadable", () => {
    expect(deriveRunning(null, { kind: "unknown" }).kind).toBe("unknown");
    expect(deriveRunning([], { kind: "nothing" })).toEqual({ kind: "known", items: [], total: 0 });
    expect(deriveRunning(null, { kind: "recorded", entries: 2, hours: 4 }).kind).toBe("known");
  });
});

describe("home state — waiting", () => {
  it("one unread conversation opens that conversation; several open the list", () => {
    const one = deriveWaiting(att({ unread: { count: 1, onlyId: "c1" } }));
    const many = deriveWaiting(att({ unread: { count: 3, onlyId: null } }));
    expect(one.kind === "known" && one.items[0].href).toBe("/dashboard/communication/c1");
    expect(many.kind === "known" && many.items[0].href).toBe("/dashboard/communication");
  });
});

describe("home state — because: no invented causality", () => {
  it("only the closed chain map yields a consequence; other events are events only", () => {
    const r = deriveBecause([
      ev("1", "engagement_created", "2026-10-01T10:00:00Z"),
      ev("2", "weekly_digest", "2026-10-02T10:00:00Z", "weekly_digest"),
      ev("3", "message_received", "2026-10-03T10:00:00Z", "conversation"),
    ]);
    if (r.kind !== "known") throw new Error("expected known");
    const byKey = Object.fromEntries(r.items.map((i) => [i.titleKey, i.chain]));
    expect(byKey.engagement_created).toEqual(CAUSAL_CHAINS.engagement_created);
    expect(byKey.weekly_digest).toBeNull();
    expect(byKey.message_received).toBeNull();
  });

  it("newest first, and every chain key is a stable i18n key", () => {
    const r = deriveBecause([ev("a", "booking_accepted", "2026-10-01T00:00:00Z"), ev("b", "booking_declined", "2026-10-04T00:00:00Z")]);
    expect(r.kind === "known" && r.items.map((i) => i.id)).toEqual(["because:b", "because:a"]);
    for (const c of Object.values(CAUSAL_CHAINS)) {
      expect(c.consequenceKey).toMatch(/^[a-z][A-Za-z]+$/);
      expect(c.stateKey).toMatch(/^[a-z][A-Za-z]+$/);
    }
  });

  it("never names a person it was not told", () => {
    const r = deriveBecause([ev("1", "engagement_created", "2026-10-01T00:00:00Z")]);
    expect(r.kind === "known" && r.items[0].subject.label).toBeNull();
  });
});

describe("home state — bounds and context neutrality", () => {
  it("each region shows at most HOME_REGION_SHOWN and still reports the true total", () => {
    const rows = Array.from({ length: 9 }, (_, i) => opp(`n${i}`));
    const r = deriveOutside(rows);
    expect(r.kind === "known" && r.items.length).toBe(HOME_REGION_SHOWN);
    expect(r.kind === "known" && r.total).toBe(9);
  });

  it("an employer context with no worker readers still composes (null regions are unknown, not errors)", () => {
    const s = composeHomeState({
      attention: att({ invitations: 1 }),
      projects: [{ projectId: "p1", title: "  ", city: null }],
      today: null,
      events: [],
      opportunities: null,
    });
    expect(s.waiting.kind === "known" && s.waiting.total).toBe(1);
    expect(s.running.kind === "known" && s.running.items[0].subject.label).toBeNull();
    expect(s.outside.kind).toBe("unknown");
    expect(leadingRegion(s)).toBe("waiting");
  });

  it("the home leads with what needs the person, then what is moving", () => {
    const s = composeHomeState({ attention: att(), projects: [{ projectId: "p", title: "X", city: null }], today: null, events: [], opportunities: [] });
    expect(leadingRegion(s)).toBe("running");
  });
});
