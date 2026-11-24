/**
 * Webhook ORDERING — the ONE state machine's transition guard (billing safety
 * v1). Out-of-order deliveries are the norm with Stripe (several events per
 * second, independent retries): a late checkout.session.completed must never
 * regress active → incomplete, an old invoice.payment_failed must never drag
 * an active row back to past_due, and a cancelled subscription is never
 * revived by a stale `updated`.
 */
import { describe, expect, it } from "vitest";

import {
  decideSubscriptionTransition,
  isHandledEventType,
  isTerminalSubStatus,
  parseSubscriptionObject,
  parseSubscriptionPrice,
} from "./webhook-core";

const T0 = 1_757_000_000; // unix seconds
const iso = (unix: number) => new Date(unix * 1000).toISOString();

describe("decideSubscriptionTransition", () => {
  it("no existing row → apply", () => {
    expect(
      decideSubscriptionTransition(null, { kind: "subscription", status: "active", eventCreated: T0 }),
    ).toEqual({ apply: true, keepStatus: false });
  });

  it("a LINK event (checkout.session.completed) on an existing row keeps the row's status", () => {
    const r = decideSubscriptionTransition(
      { status: "active", lastEventCreatedAt: iso(T0) },
      { kind: "link", status: "incomplete", eventCreated: T0 - 5 },
    );
    expect(r).toEqual({ apply: true, keepStatus: true });
  });

  it("an event OLDER than the row's last event is stale", () => {
    const r = decideSubscriptionTransition(
      { status: "active", lastEventCreatedAt: iso(T0) },
      { kind: "subscription", status: "incomplete", eventCreated: T0 - 1 },
    );
    expect(r).toEqual({ apply: false, reason: "stale_event" });
  });

  it("an equal-timestamp event applies (Stripe emits several per second)", () => {
    const r = decideSubscriptionTransition(
      { status: "incomplete", lastEventCreatedAt: iso(T0) },
      { kind: "subscription", status: "active", eventCreated: T0 },
    );
    expect(r).toEqual({ apply: true, keepStatus: false });
  });

  it("a newer event applies", () => {
    const r = decideSubscriptionTransition(
      { status: "active", lastEventCreatedAt: iso(T0) },
      { kind: "subscription", status: "past_due", eventCreated: T0 + 60 },
    );
    expect(r).toEqual({ apply: true, keepStatus: false });
  });

  it("a terminal row (cancelled/expired) is never revived — even without timestamps", () => {
    for (const status of ["cancelled", "expired"]) {
      const r = decideSubscriptionTransition(
        { status, lastEventCreatedAt: null },
        { kind: "subscription", status: "active", eventCreated: null },
      );
      expect(r, status).toEqual({ apply: false, reason: "terminal_state" });
    }
  });

  it("a terminal → terminal write still applies (e.g. deleted after incomplete_expired)", () => {
    const r = decideSubscriptionTransition(
      { status: "expired", lastEventCreatedAt: null },
      { kind: "subscription", status: "cancelled", eventCreated: null },
    );
    expect(r).toEqual({ apply: true, keepStatus: false });
  });

  it("legacy rows without last_event_created_at apply newer-or-unknown events (ordering degrades, never blocks)", () => {
    const r = decideSubscriptionTransition(
      { status: "incomplete", lastEventCreatedAt: null },
      { kind: "subscription", status: "active", eventCreated: T0 },
    );
    expect(r).toEqual({ apply: true, keepStatus: false });
  });

  it("an invoice event older than the row's last event is stale; on a terminal row it is skipped", () => {
    expect(
      decideSubscriptionTransition(
        { status: "active", lastEventCreatedAt: iso(T0) },
        { kind: "invoice", status: "past_due", eventCreated: T0 - 10 },
      ),
    ).toEqual({ apply: false, reason: "stale_event" });
    expect(
      decideSubscriptionTransition(
        { status: "cancelled", lastEventCreatedAt: iso(T0) },
        { kind: "invoice", status: null, eventCreated: T0 + 10 },
      ),
    ).toEqual({ apply: false, reason: "terminal_state" });
  });

  it("isTerminalSubStatus names exactly cancelled + expired", () => {
    expect(isTerminalSubStatus("cancelled")).toBe(true);
    expect(isTerminalSubStatus("expired")).toBe(true);
    expect(isTerminalSubStatus("active")).toBe(false);
    expect(isTerminalSubStatus(null)).toBe(false);
  });
});

describe("price evidence + event carry-through on parseSubscriptionObject", () => {
  const sub = {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    metadata: { canonical_plan_key: "company_pilot", owner_id: "o1", organization_id: "org1" },
    items: { data: [{ price: { id: "price_99", unit_amount: 9900, currency: "eur" }, current_period_end: T0 + 30 * 86400 }] },
  };

  it("extracts the first item's price id / unit amount / currency", () => {
    expect(parseSubscriptionPrice(sub)).toEqual({ priceId: "price_99", unitAmountCents: 9900, currency: "eur" });
    expect(parseSubscriptionPrice({ items: { data: [{ price: "price_x" }] } })).toEqual({ priceId: "price_x", unitAmountCents: null, currency: null });
    expect(parseSubscriptionPrice({})).toEqual({ priceId: null, unitAmountCents: null, currency: null });
  });

  it("carries the event id + created and the price evidence into the upsert", () => {
    const u = parseSubscriptionObject(sub, false, { id: "evt_1", created: T0 })!;
    expect(u.eventId).toBe("evt_1");
    expect(u.eventCreated).toBe(T0);
    expect(u.providerPriceId).toBe("price_99");
    expect(u.unitAmountCents).toBe(9900);
    expect(u.currency).toBe("eur");
    expect(u.organizationId).toBe("org1");
  });

  it("legacy callers (no event) still parse — ordering fields are null", () => {
    const u = parseSubscriptionObject(sub, true)!;
    expect(u.eventId).toBeNull();
    expect(u.eventCreated).toBeNull();
  });

  it("checkout.session.expired is a handled bookkeeping event", () => {
    expect(isHandledEventType("checkout.session.expired")).toBe(true);
  });
});
