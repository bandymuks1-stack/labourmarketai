import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTACT_PERMISSION_STATES } from "@/lib/communication/communication-eligibility";

/**
 * Booking lifecycle guard (quality-train PR C).
 *
 * The root-cause audit's flow #6: "after accept there is no calendar entry,
 * journal link, or CTA. Accepted is a terminal dead-end." This guard pins
 * the repairs: no booking status the user can actually reach is a dead end
 * on the side that can act, the accepted→conversation step is grant-gated
 * server-side, and the unreachable `expired` status makes no promise the
 * system cannot keep (no scheduler exists).
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const PAGE = read("app/[locale]/dashboard/bookings/page.tsx");
const ACTION = read("lib/booking/booking-conversation.ts");

describe("no reachable booking status is a dead end for the actor who can move", () => {
  it("accepted rows render the message CTA in BOTH lists", () => {
    expect(PAGE).toMatch(/booking-incoming-message-cta/);
    expect(PAGE).toMatch(/booking-outgoing-message-cta/);
    // Both are the SAME server action — one sanctioned conversation opener.
    expect(PAGE).toMatch(/action=\{openBookingConversationAction\}/);
  });

  it("outgoing proposed rows can be withdrawn (the RPC finally has UI)", () => {
    expect(PAGE).toMatch(/<BookingWithdrawButton/);
    const btn = read("components/app/booking-withdraw-button.tsx");
    expect(btn).toMatch(/withdrawBookingAction/);
  });

  it("outgoing declined rows point at the honest next step (scouting)", () => {
    expect(PAGE).toMatch(/booking-declined-next-action/);
    expect(PAGE).toMatch(/href="\/dashboard\/company\/scouting"/);
  });

  it("incoming proposed rows keep accept/decline (worker decides)", () => {
    expect(PAGE).toMatch(/<BookingRespondButtons/);
  });
});

describe("accepted→conversation is grant-gated server-side (§8.1 twin)", () => {
  it("the action requires status === 'accepted' before any grant", () => {
    expect(ACTION).toMatch(/booking\.status !== "accepted"\) redirect\(cannotOpen\)/);
  });

  it("the action passes the explicit allowed_accepted_booking grant", () => {
    expect(ACTION).toMatch(/"allowed_accepted_booking"/);
    expect(ACTION).toMatch(/getOrCreateDirectConversation\(/);
  });

  it("the caller must be a participant — owner or booked worker, nobody else", () => {
    expect(ACTION).toMatch(/user!\.id === booking!\.owner_id/);
    expect(ACTION).toMatch(/user!\.id === workerProfileId/);
    expect(ACTION).toMatch(/if \(!counterpart\) redirect\(cannotOpen\)/);
  });

  it("failure lands on the honest cannot_open notice, never a silent bounce", () => {
    expect(ACTION).toMatch(/\?notice=cannot_open/);
  });

  it("the grant is a reviewed member of the §8.1 enumeration", () => {
    expect(CONTACT_PERMISSION_STATES).toContain("allowed_accepted_booking");
  });

  it("no counterpart profile id reaches the client (server action file)", () => {
    expect(ACTION).toMatch(/^"use server";/);
    // The action returns void (redirects) — it never returns row data.
    expect(ACTION).toMatch(/Promise<void>/);
  });
});

describe("expired: unreachable status makes no promise (no scheduler exists)", () => {
  it("booking copy never promises automatic expiry", () => {
    for (const loc of ["lt", "en", "ru"] as const) {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        bookings: Record<string, unknown>;
      };
      const blob = JSON.stringify(msgs.bookings).toLowerCase();
      // No countdown / auto-lapse claims — the system has no scheduler.
      expect(blob, loc).not.toMatch(/expires in|galios iki|истекает через/);
    }
  });

  it("the lifecycle decision is documented for the owner", () => {
    const doc = read("../../docs/launch/booking-lifecycle-v1.md");
    expect(doc).toMatch(/no scheduler, trigger or cron exists/);
    expect(doc).toMatch(/allowed_accepted_booking/);
  });
});

describe("new lifecycle copy exists in every served locale", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: bookings.actions message/withdraw/findAnother are non-empty`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        bookings: { actions: Record<string, string> };
      };
      for (const key of ["message", "withdraw", "findAnother"]) {
        expect(
          msgs.bookings.actions[key]?.trim().length,
          `${loc}: bookings.actions.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }
});
