import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * V8 notification v2 — the two loop-matrix gaps stay closed.
 *
 * The constraint admitting `booking_withdrawn` and `engagement_ended` was
 * applied to production 2026-08-13 (ledger 20260813072402). These pins keep
 * the CODE side honest: every successful withdraw emits to the worker, every
 * successful end emits to the counterparty, and both types render a real
 * label in all 11 catalogues — an admitted type with no emitter (or no
 * label) would be a durable store that silently never hears about its event.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const CATALOGUE = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;

describe("booking_withdrawn — the worker durably learns the offer is gone", () => {
  it("EVERY withdraw success path emits, and to the type the constraint admits", () => {
    const src = read("lib", "booking", "booking-actions.ts");
    const emits = src.match(/emitBookingNotification\(input\.bookingId, "booking_withdrawn"\)/g) ?? [];
    // v2 + v1 + no-reason: three success returns, three emits — a fourth
    // path added without its emit goes RED here.
    expect(emits).toHaveLength(3);
    const successes = src.match(/status: "withdrawn"/g) ?? [];
    expect(successes.length).toBe(emits.length);
  });

  it("the emitter routes withdrawn to the WORKER branch (the company acted)", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    expect(src).toMatch(
      /eventType === "booking_proposed" \|\| eventType === "booking_withdrawn"/,
    );
  });
});

describe("engagement_ended — the counterparty hears it, the actor does not", () => {
  it("the end action emits after a real state change", () => {
    const src = read("lib", "engagements", "end-engagement.ts");
    expect(src).toContain("emitEngagementEndedNotification(engagement, actorSide)");
  });

  it("recipient is the COUNTERPARTY of the server-derived actor side", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const fn = src.slice(src.indexOf("export async function emitEngagementEndedNotification"));
    expect(fn).toMatch(/actorSide === "worker"[\s\S]{0,400}companies/);
    expect(fn).toMatch(/workerProfileId/);
    // Neutral-visibility doctrine: the emitter must not carry visibility
    // claims it has not measured — metadata stays empty.
    expect(fn).toContain("metadata: {}");
  });
});

describe("both v2 types are typed and labelled everywhere", () => {
  it("the union admits exactly what the production constraint admits", () => {
    const src = read("lib", "notifications", "events.ts");
    expect(src).toContain('"booking_withdrawn"');
    expect(src).toContain('"engagement_ended"');
  });

  for (const l of CATALOGUE) {
    it(`${l} carries labels for both new event types`, () => {
      const m = JSON.parse(read("messages", `${l}.json`));
      const types = m.auth.notifications.types;
      expect(typeof types.event_booking_withdrawn, l).toBe("string");
      expect(typeof types.event_engagement_ended, l).toBe("string");
      expect(types.event_booking_withdrawn.length, l).toBeGreaterThan(10);
      expect(types.event_engagement_ended.length, l).toBeGreaterThan(10);
      // The neutral-visibility rule, enforced on copy: the label may not
      // claim the company can/cannot still see the worker.
      expect(types.event_engagement_ended.toLowerCase(), l).not.toMatch(/see|matyt|видит|sieht/);
    });
  }
});
