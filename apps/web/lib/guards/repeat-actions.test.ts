import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canRequestAgain,
  REQUEST_STATUSES,
  type RequestStatus,
} from "../marketplace/service-requests-shared";

/**
 * Repeat actions guard (Capability G, PR 6b) — "request again", and the
 * retirement of "propose again" (rebook).
 *
 *   - request again: ONLY concluded (declined/withdrawn) outgoing service
 *     requests — never `sent` (still open), never `accepted` (the next step
 *     is the conversation, not a duplicate request). It is the EXISTING
 *     request_service_offering action (the one-open-request unique index is
 *     partial on status='sent').
 *   - propose again: RETIRED by 20261021095200 (owner-approved fix programme
 *     2026-10-21). It relied on the propose RPC turning a declined /
 *     withdrawn row back into an open proposal — overriding the worker's "no"
 *     and escaping the 30-per-day cap (an upsert creates no row). The RPC now
 *     refuses with `booking_not_reopenable`; a button that can only be
 *     refused would be a dead control, so the page no longer offers it.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

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

describe("an answered booking proposal is not re-opened (20261021095200)", () => {
  const PAGE = read("app/[locale]/dashboard/bookings/page.tsx");
  const OUTGOING = PAGE.slice(PAGE.indexOf('title={t("outgoing.title")}'));
  const SQL = readFileSync(
    join(REPO, "supabase", "migrations", "20261021095200_booking_propose_reachable_open_v1.sql"),
    "utf8",
  );

  it("the bookings page offers no propose-again on a declined or withdrawn row", () => {
    expect(PAGE).not.toMatch(/<ProposeBookingButton|variant="rebook"|canProposeAgain/);
    // the declined row keeps its honest next step
    expect(OUTGOING).toMatch(/row\.status === "declined" \? \(/);
    expect(OUTGOING).toMatch(/booking-declined-next-action/);
  });

  it("the helper that derived the affordance is gone", () => {
    expect(read("lib/booking/booking-state.ts")).not.toMatch(/canProposeAgain/);
  });

  it("the RPC refuses the re-open and re-opens only an expired row", () => {
    expect(SQL).toMatch(/if v_existing in \('declined', 'withdrawn'\) then\s*raise exception 'booking_not_reopenable'/);
    expect(SQL).toMatch(/case when public\.booking_requests\.status = 'expired'/);
  });

  it("the action refuses first and names the answer", () => {
    const actions = read("lib/booking/booking-actions.ts");
    const fn = actions.slice(actions.indexOf("export async function proposeBookingAction("));
    const refuse = fn.indexOf('return { kind: "refused", reason: "already-answered" }');
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse).toBeLessThan(fn.indexOf('rpc("propose_booking_request_v3"'));
    expect(actions).toContain("booking_not_reopenable");
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
  for (const loc of ["lt", "en", "ru", "nl", "de", "pl"] as const) {
    it(`${loc}: repeat-action copy is present, non-empty and not [EN]-debt`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        bookings: { actions: Record<string, string>; propose: Record<string, string> };
        marketplace: Record<string, unknown>;
      };
      for (const v of [
        j.bookings.propose.refusedAnswered,
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
