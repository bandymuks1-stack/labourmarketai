import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canProposeAgain, type BookingStatus } from "../booking/booking-state";
import {
  canRequestAgain,
  REQUEST_STATUSES,
  type RequestStatus,
} from "../marketplace/service-requests-shared";

/**
 * Repeat actions guard (Capability G, PR 6b) — "propose again" (rebook) and
 * "request again".
 *
 * Both affordances are pure derivations over the row's DB status,
 * default-closed:
 *   - rebook: ONLY terminal declined/withdrawn OUTGOING bookings — never
 *     `proposed` (still open, withdraw instead), never `accepted` (a real
 *     engagement), never `expired` (unreachable, no scheduler writes it).
 *   - request again: ONLY concluded (declined/withdrawn) outgoing service
 *     requests — never `sent` (still open), never `accepted` (the next step
 *     is the conversation, not a duplicate request).
 * Neither adds a new RPC or data path: rebook is the EXISTING propose flow
 * pre-scoped to the same request + worker (the applied propose RPC upserts on
 * (owner_id, request_id, worker_id) and re-opens the row), and request-again
 * is the EXISTING request_service_offering action (the one-open-request
 * unique index is partial on status='sent').
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const ALL_BOOKING_STATUSES: readonly BookingStatus[] = [
  "proposed",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
];

describe("canProposeAgain — pure, default-closed, exhaustive", () => {
  it("is true ONLY for the terminal declined/withdrawn statuses", () => {
    const expected: Record<BookingStatus, boolean> = {
      proposed: false, // still open — the affordance there is withdraw
      accepted: false, // a real engagement — message/plan, never re-propose
      declined: true, // worker said no → the company may re-open with new dates
      withdrawn: true, // company took it back → may re-open with new dates
      expired: false, // unreachable status — no affordance for it
    };
    for (const s of ALL_BOOKING_STATUSES) {
      expect(canProposeAgain(s), `canProposeAgain(${s})`).toBe(expected[s]);
    }
  });

  it("never derives an affordance for proposed/accepted (the goal's hard NO)", () => {
    expect(canProposeAgain("proposed")).toBe(false);
    expect(canProposeAgain("accepted")).toBe(false);
  });
});

describe("canRequestAgain — pure, default-closed, exhaustive", () => {
  it("is true ONLY for concluded declined/withdrawn requests", () => {
    const expected: Record<RequestStatus, boolean> = {
      sent: false, // still open — withdraw instead; a duplicate would 23505
      accepted: false, // the next step is the conversation, not re-request
      declined: true, // provider said no → the buyer may ask again
      withdrawn: true, // buyer took it back → may ask again
    };
    for (const s of REQUEST_STATUSES) {
      expect(canRequestAgain(s), `canRequestAgain(${s})`).toBe(expected[s]);
    }
  });
});

describe("rebook wiring — existing propose flow, company side only", () => {
  const PAGE = read("app/[locale]/dashboard/bookings/page.tsx");
  const INCOMING_START = PAGE.indexOf('title={t("incoming.title")}');
  const OUTGOING_START = PAGE.indexOf('title={t("outgoing.title")}');
  const INCOMING = PAGE.slice(INCOMING_START, OUTGOING_START);
  const OUTGOING = PAGE.slice(OUTGOING_START);

  it("the affordance is gated by the pure helper, in the OUTGOING list only", () => {
    expect(OUTGOING).toMatch(/canProposeAgain\(row\.status\)/);
    expect(INCOMING).not.toMatch(/canProposeAgain|ProposeBookingButton/);
  });

  it("reuses ProposeBookingButton pre-scoped to the SAME request + worker (no new RPC)", () => {
    expect(OUTGOING).toMatch(/<ProposeBookingButton/);
    expect(OUTGOING).toMatch(/requestId=\{row\.requestId\}/);
    expect(OUTGOING).toMatch(/workerId=\{row\.workerId\}/);
    expect(OUTGOING).toMatch(/variant="rebook"/);
  });

  it("the rebook variant states that it RE-OPENS the same proposal (worker decides again)", () => {
    const btn = read("components/app/propose-booking-button.tsx");
    expect(btn).toMatch(/variant === "rebook" \? tPropose\("againModeNote"\) : tPropose\("modeNote"\)/);
    // The default variant is untouched — the scouting surface keeps its copy.
    expect(btn).toMatch(/variant = "propose"/);
  });

  it("the button still runs the ONE existing propose action (entitlement-gated server-side)", () => {
    const btn = read("components/app/propose-booking-button.tsx");
    expect(btn).toMatch(/proposeBookingAction/);
    const actions = read("lib/booking/booking-actions.ts");
    expect(actions).toMatch(/hasFeature\("booking_requests"\)/);
    expect(actions).toMatch(/rpc\("propose_booking_request"/);
  });
});

describe("request-again wiring — existing request action, buyer side only", () => {
  const SECTION = read("components/app/marketplace-loop-section.tsx");

  it("the affordance is gated by the pure helper AND no already-open request", () => {
    expect(SECTION).toMatch(
      /canRequestAgain\(r\.status\) && !openRequestOfferingIds\.has\(r\.offeringId\)/,
    );
  });

  it("prefills the previous message and sends through the EXISTING action", () => {
    expect(SECTION).toMatch(/previousMessage=\{r\.message\}/);
    expect(SECTION).toMatch(/requestServiceOffering\(offeringId, message\)/);
  });

  it("surfaces the server's honest answers — duplicate and inactive, never fake success", () => {
    expect(SECTION).toMatch(/res\.kind === "duplicate"/);
    expect(SECTION).toMatch(/res\.kind === "inactive"/);
    const actions = read("lib/marketplace/service-requests.ts");
    expect(actions).toMatch(/offering_not_active/);
    expect(actions).toMatch(/return \{ kind: "inactive" \}/);
  });
});

describe("i18n — the new keys exist in every active locale", () => {
  for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
    it(`${loc}: repeat-action copy is present, non-empty and not [EN]-debt`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        bookings: { actions: Record<string, string>; propose: Record<string, string> };
        marketplace: Record<string, unknown>;
      };
      for (const v of [
        j.bookings.actions.proposeAgain,
        j.bookings.propose.againModeNote,
        j.marketplace.requestAgain as string,
        j.marketplace.requestAgainNote as string,
        j.marketplace.cancel as string,
        j.marketplace.offeringInactive as string,
      ]) {
        expect(v?.trim().length, `${loc}`).toBeGreaterThan(0);
        expect(v).not.toContain("[EN]");
      }
    });
  }
});
