import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DECLINE_REASON_KINDS,
  WITHDRAW_REASON_KINDS,
  REASON_NOTE_MAX,
  canRescheduleProposal,
  isResponseDeadlinePast,
  normalizeBookingReason,
  withDeadlineDisplayState,
  type BookingStatus,
} from "../booking/booking-state";

/**
 * Booking UX compat guard (P2-PR6).
 *
 * The owner-gated lifecycle-v2 migration (draft PR #722,
 * supabase/migrations/20260711290000_booking_lifecycle_v2.sql) adds reason
 * capture, reschedule, and a respond-by date — WHEN the owner applies it.
 * This guard pins the compat layer that must stay honest in BOTH worlds:
 *
 *   1. reason vocabularies match the migration contract VERBATIM;
 *   2. every v2 RPC call has a v1 fallback on 42883/PGRST202 (the response
 *      is never lost; the partial outcome is tagged, never faked);
 *   3. the deadline column read tolerates 42703 and retries with the base
 *      column list (the page renders either way);
 *   4. nothing client- or action-side ever writes the reserved 'expired'
 *      status (the sweep is admin-only, server-side, owner-gated);
 *   5. reschedule is a PROPOSED-only affordance — an accepted booking is
 *      never mutated in place and never shows the control.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const ACTIONS = read("lib/booking/booking-actions.ts");
const PAGE = read("app/[locale]/dashboard/bookings/page.tsx");
const RESPOND = read("components/app/booking-respond-buttons.tsx");
const WITHDRAW = read("components/app/booking-withdraw-button.tsx");
const MANAGE = read("components/app/booking-manage-controls.tsx");

const ALL_STATUSES: readonly BookingStatus[] = [
  "proposed",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
];

// The page renders incoming (worker) before outgoing (company).
const INCOMING_START = PAGE.indexOf('title={t("incoming.title")}');
const OUTGOING_START = PAGE.indexOf('title={t("outgoing.title")}');
const INCOMING = PAGE.slice(INCOMING_START, OUTGOING_START);
const OUTGOING = PAGE.slice(OUTGOING_START);

// ── 1. Reason vocabularies pinned to the #722 migration literals ───────────

describe("reason vocabularies match the lifecycle-v2 contract verbatim", () => {
  it("decline kinds are exactly the four contract literals, in order", () => {
    expect([...DECLINE_REASON_KINDS]).toEqual([
      "dates_unsuitable",
      "conditions_unsuitable",
      "already_booked",
      "other",
    ]);
  });

  it("withdraw kinds are exactly the four contract literals, in order", () => {
    expect([...WITHDRAW_REASON_KINDS]).toEqual([
      "position_filled",
      "need_changed",
      "dates_changed",
      "other",
    ]);
  });

  it("the note bound matches the contract CHECK (<= 500)", () => {
    expect(REASON_NOTE_MAX).toBe(500);
  });

  it("normalizeBookingReason is default-closed: unknown kinds and bare notes take the v1 path", () => {
    expect(normalizeBookingReason("made_up_kind", "note", DECLINE_REASON_KINDS)).toBeNull();
    expect(normalizeBookingReason("", "just a note", DECLINE_REASON_KINDS)).toBeNull();
    expect(normalizeBookingReason(null, null, DECLINE_REASON_KINDS)).toBeNull();
    // A withdraw kind never validates against the decline vocabulary.
    expect(
      normalizeBookingReason("position_filled", null, DECLINE_REASON_KINDS),
    ).toBeNull();
  });

  it("normalizeBookingReason bounds the note and drops the empty note", () => {
    const long = "x".repeat(REASON_NOTE_MAX + 100);
    const r = normalizeBookingReason("other", long, DECLINE_REASON_KINDS);
    expect(r?.kind).toBe("other");
    expect(r?.note?.length).toBe(REASON_NOTE_MAX);
    expect(normalizeBookingReason("other", "   ", DECLINE_REASON_KINDS)?.note).toBeNull();
  });
});

// ── 2. v2 → v1 fallback exists (the response is never lost) ────────────────

describe("every v2 RPC call is wrapped with absent-function detection + v1 retry", () => {
  it("the wrapper detects exactly the two absent-function codes", () => {
    expect(ACTIONS).toMatch(
      /error\.code === "42883" \|\| error\.code === "PGRST202"/,
    );
  });

  it("respond: v2 call present, v1 retry present, partial outcome tagged", () => {
    expect(ACTIONS).toMatch(/rpc\("respond_booking_request_v2"/);
    // The v1 RPC is still called (both as fallback and as the no-reason path).
    expect(ACTIONS).toMatch(/rpc\("respond_booking_request"/);
    const v2 = ACTIONS.indexOf('rpc("respond_booking_request_v2"');
    const fallback = ACTIONS.indexOf('rpc("respond_booking_request"', v2);
    expect(v2).toBeGreaterThan(-1);
    expect(fallback, "v1 retry after the v2 attempt").toBeGreaterThan(v2);
  });

  it("withdraw: v2 call present, v1 retry present", () => {
    expect(ACTIONS).toMatch(/rpc\("withdraw_booking_request_v2"/);
    const v2 = ACTIONS.indexOf('rpc("withdraw_booking_request_v2"');
    const fallback = ACTIONS.indexOf('rpc("withdraw_booking_request"', v2);
    expect(fallback, "v1 retry after the v2 attempt").toBeGreaterThan(v2);
  });

  it("the partial result is TAGGED (reasonStored: false), never a silent full success", () => {
    expect(ACTIONS).toMatch(/reasonStored: false/);
    expect(ACTIONS).toMatch(/reasonStored: true/);
  });

  it("both reason UIs surface the honest partial note", () => {
    for (const src of [RESPOND, WITHDRAW]) {
      expect(src).toMatch(/reasonStored === false/);
      expect(src).toMatch(/booking-reason-not-stored/);
      expect(src).toMatch(/reason\.notStored/);
    }
  });

  it("the reason selects offer ONLY the closed vocabulary (+ the empty v1 option)", () => {
    expect(RESPOND).toMatch(/DECLINE_REASON_KINDS\.map/);
    expect(WITHDRAW).toMatch(/WITHDRAW_REASON_KINDS\.map/);
    // The empty option = no reason chosen = today's v1 behaviour.
    expect(RESPOND).toMatch(/<option value="">/);
    expect(WITHDRAW).toMatch(/<option value="">/);
  });
});

// ── 3. Deadline column read tolerates the not-yet-applied column ───────────

describe("listMyBookings tolerates the future response_deadline_date column", () => {
  it("attempts the extended column list and retries the base list on 42703", () => {
    expect(ACTIONS).toMatch(/response_deadline_date/);
    expect(ACTIONS).toMatch(/"42703"/);
    expect(ACTIONS).toMatch(/EXTENDED_BOOKING_COLUMNS/);
    expect(ACTIONS).toMatch(/BASE_BOOKING_COLUMNS/);
    // Downgrade decision precedes the base-list retry.
    const detect = ACTIONS.indexOf("ABSENT_COLUMN");
    const retry = ACTIONS.indexOf("select(BASE_BOOKING_COLUMNS)");
    expect(detect).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(-1);
  });

  it("the downgrade is memoized per request (no doomed re-attempts in one render)", () => {
    expect(ACTIONS).toMatch(/deadlineColumnDowngrade = cache\(/);
  });

  it("the deadline chip renders ONLY from a real non-null value", () => {
    expect(PAGE).toMatch(/row\.responseDeadlineDate \? \(/);
    expect(PAGE).toMatch(/booking-deadline-chip/);
    expect(PAGE).toMatch(/t\("deadline\.respondBy", \{ date: row\.responseDeadlineDate \}\)/);
  });

  it("a past-due deadline prefers the EXISTING stale display state (no new state, no fake status)", () => {
    expect(PAGE).toMatch(/withDeadlineDisplayState\(/);
    const past = withDeadlineDisplayState(
      {
        status: "proposed",
        createdAt: "2026-07-10T00:00:00.000Z",
        responseDeadlineDate: "2026-07-10",
      },
      "2026-07-12T00:00:00.000Z",
    );
    expect(past).toBe("no_response_stale");
    // Deadline day itself is still open.
    expect(
      withDeadlineDisplayState(
        {
          status: "proposed",
          createdAt: "2026-07-10T00:00:00.000Z",
          responseDeadlineDate: "2026-07-12",
        },
        "2026-07-12T10:00:00.000Z",
      ),
    ).toBe("awaiting_response");
    // Terminal statuses pass through untouched, deadline or not.
    expect(
      withDeadlineDisplayState(
        {
          status: "accepted",
          createdAt: "2026-01-01T00:00:00.000Z",
          responseDeadlineDate: "2026-01-02",
        },
        "2026-07-12T00:00:00.000Z",
      ),
    ).toBe("accepted");
    // Unparseable / absent deadlines never claim past-due.
    expect(isResponseDeadlinePast("not-a-date", "2026-07-12T00:00:00.000Z")).toBe(false);
    expect(isResponseDeadlinePast(null, "2026-07-12T00:00:00.000Z")).toBe(false);
  });
});

// ── 4. No new writer of the reserved 'expired' status ──────────────────────

describe("no client/action code writes the reserved terminal status", () => {
  it("the actions module and every booking UI component stay free of the literal", () => {
    for (const [name, src] of [
      ["booking-actions.ts", ACTIONS],
      ["booking-respond-buttons.tsx", RESPOND],
      ["booking-withdraw-button.tsx", WITHDRAW],
      ["booking-manage-controls.tsx", MANAGE],
    ] as const) {
      expect(src, name).not.toMatch(/expired/);
    }
  });
});

// ── 5. Reschedule is a PROPOSED-only affordance ─────────────────────────────

describe("reschedule exists ONLY on open proposals — accepted rows are never mutated", () => {
  it("canRescheduleProposal allows exactly 'proposed'", () => {
    for (const s of ALL_STATUSES) {
      expect(canRescheduleProposal(s), s).toBe(s === "proposed");
    }
  });

  it("the page mounts the manage controls behind canRescheduleProposal, outgoing list only", () => {
    expect(PAGE.match(/<BookingManageControls/g)).toHaveLength(1);
    expect(PAGE).toMatch(
      /canRescheduleProposal\(row\.status\) \? \(\s*(?:\/\/[^\n]*\n\s*)*<BookingManageControls/,
    );
    expect(OUTGOING).toMatch(/<BookingManageControls/);
    expect(INCOMING).not.toMatch(/BookingManageControls/);
  });

  it("the manage component calls only the two owner-gated v1 lifecycle actions", () => {
    expect(MANAGE).toMatch(/rescheduleBookingAction/);
    expect(MANAGE).toMatch(/setBookingDeadlineAction/);
    expect(MANAGE).not.toMatch(/respondBookingAction|withdrawBookingAction/);
  });

  it("the reschedule/deadline actions call the contract RPC names and degrade honestly", () => {
    expect(ACTIONS).toMatch(/rpc\("reschedule_booking_proposal_v1"/);
    expect(ACTIONS).toMatch(/rpc\("set_booking_response_deadline_v1"/);
    // Both route errors through classify → absent function = needs-migration
    // → the UI's calm "not changed / not saved" sentence, never fake success.
    expect(MANAGE).toMatch(/needs-migration/);
    expect(MANAGE).toMatch(/reschedule\.notChanged/);
    expect(MANAGE).toMatch(/deadline\.notSet/);
  });
});

// ── 6. i18n: the new keys exist in every catalog, kinds mirror the vocab ────

describe("reason/reschedule/deadline copy lands in all 11 locales", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "da", "et", "lv", "no", "pl", "sv"] as const;
  const REAL = new Set(["en", "lt", "ru", "nl", "de", "da"]);

  for (const loc of LOCALES) {
    it(`${loc}: all new keys are present and non-empty`, () => {
      const bookings = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          bookings: Record<string, Record<string, unknown>>;
        }
      ).bookings;
      const reason = bookings.reason as Record<string, unknown>;
      const decline = reason.decline as Record<string, string>;
      const withdraw = reason.withdraw as Record<string, string>;
      // The select option keys mirror the contract vocabularies exactly.
      expect(Object.keys(decline).sort()).toEqual([...DECLINE_REASON_KINDS].sort());
      expect(Object.keys(withdraw).sort()).toEqual([...WITHDRAW_REASON_KINDS].sort());
      const leaves: string[] = [];
      const walk = (n: unknown): void => {
        if (typeof n === "string") leaves.push(n);
        else if (n && typeof n === "object") Object.values(n).forEach(walk);
      };
      walk(bookings.reason);
      walk(bookings.reschedule);
      walk(bookings.deadline);
      expect(leaves.length).toBeGreaterThanOrEqual(30);
      for (const v of leaves) expect(v.trim().length).toBeGreaterThan(0);
      if (REAL.has(loc)) {
        for (const v of leaves) expect(v, loc).not.toMatch(/^\[EN\] /);
      }
      // The respond-by chip keeps its {date} placeholder in every catalog.
      expect((bookings.deadline as Record<string, string>).respondBy).toContain("{date}");
    });
  }
});
