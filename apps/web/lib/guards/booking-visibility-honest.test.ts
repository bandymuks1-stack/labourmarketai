import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Booking visibility honesty guard.
 *
 * Owner IA decision: bookings / reservation requests do NOT return to the
 * account dropdown and are NOT a separate primary nav item. Their home is
 * Žinutės (they are communication/request objects). No fake badge, no fake
 * count, no fake card — `getPendingIncomingBookingCount` returns 0 on any
 * non-ok state. (W3 Package 4 deleted the second dashboard and with it the
 * count-gated bookings next-action card; the Žinutės surface remains the one
 * count-gated entry point.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the real pending-booking count is honest (0 on any non-ok state)", () => {
  const src = read("lib/booking/booking-actions.ts");
  it("getPendingIncomingBookingCount exists and returns 0 unless kind === 'ok'", () => {
    expect(src).toMatch(/export async function getPendingIncomingBookingCount/);
    expect(src).toMatch(/if\s*\(result\.kind\s*!==\s*"ok"\)\s*return\s*0/);
    // counts only real pending incoming proposals
    expect(src).toMatch(/incoming\.filter\(\(b\)\s*=>\s*b\.status\s*===\s*"proposed"\)/);
  });
});

describe("bookings surface under Žinutės, count-gated — never a fake badge", () => {
  const comm = read("app/[locale]/dashboard/communication/page.tsx");

  it("Žinutės shows a booking link ONLY when pendingBookings > 0", () => {
    expect(comm).toMatch(/getPendingIncomingBookingCount/);
    expect(comm).toMatch(/pendingBookings\s*>\s*0/);
    expect(comm).toMatch(/communication-bookings-link/);
    expect(comm).toMatch(/\/dashboard\/bookings/);
  });
});

describe("bookings is NOT a duplicate top-level entry", () => {
  it("bookings is not a primary nav tab", () => {
    expect(
      VISIBLE_PRIMARY_NAV_ITEMS.some((i) => i.href === "/dashboard/bookings"),
    ).toBe(false);
  });
  it("bookings is not back in the account dropdown", () => {
    const menu = read("components/app/account-menu.tsx");
    expect(menu).not.toMatch(/account-menu-bookings-link/);
    expect(menu).not.toMatch(/\/dashboard\/bookings/);
  });
});
