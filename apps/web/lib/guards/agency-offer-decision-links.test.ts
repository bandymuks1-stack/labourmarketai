import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P0.2 candidate-to-hire, the agency variant. Two missing links:
 *   1. a client ACCEPTING an agency's candidate proposes dates to the worker,
 *      and the worker was told nothing (the direct proposal path tells them);
 *   2. the decision, contact, dates and shortlist controls stayed live on a
 *      CLOSED need, where the database refuses every one of them.
 */
const web = join(__dirname, "..", "..");
const bridge = readFileSync(join(web, "lib/agency/bridge-actions.ts"), "utf8");
const notify = readFileSync(join(web, "lib/booking/booking-notify.ts"), "utf8");
const page = readFileSync(join(web, "app/[locale]/dashboard/company/scouting/page.tsx"), "utf8");

describe("accepting an agency's candidate tells the worker", () => {
  it("only an accept that really proposed a booking rings the bell", () => {
    expect(bridge).toContain('import { notifyBooking } from "@/lib/booking/booking-notify";');
    // The function answers the OFFER's id when it proposed nothing.
    expect(bridge).toMatch(/decision === "accepted" && typeof decided === "string" && isBridgeUuid\(decided\) && decided !== offerId/);
    expect(bridge).toContain('await notifyBooking(supabase, decided, "booking_proposed");');
    expect(bridge).not.toMatch(/void notifyBooking/);
  });

  it("the shared notifier is not a server action and reads under the caller's session", () => {
    expect(notify.startsWith('import "server-only";')).toBe(true);
    expect(notify).not.toMatch(/^"use server";?$/m);
    expect(notify).not.toMatch(/createAdminClient|supabase\/admin/);
  });
});

describe("an offered candidate on a closed need has no live control", () => {
  const start = page.indexOf("scout-offered-");
  const section = page.slice(start, page.indexOf("<TeamOffersReceived", start));

  it("the decision is offered only on an open need, and a closed one says why", () => {
    expect(section).toMatch(/\{oc\.offerStatus === "offered" && needOpen \? \(\s+<OfferDecisionButtons/);
    expect(section).toMatch(/\{oc\.offerStatus === "offered" && !needOpen \? \(/);
    expect(section).toContain("scout-offered-need-closed-");
  });

  it("contact, dates and shortlist in that card are behind an open need", () => {
    const gate = section.indexOf("{needOpen ? (\n                <div className=\"flex flex-col gap-2\">");
    expect(gate).toBeGreaterThan(-1);
    for (const control of ["<RequestCommunicationButton", "<ProposeBookingButton", "<ScoutingShortlistButtons"]) {
      expect(section.indexOf(control), control).toBeGreaterThan(gate);
    }
  });
});
