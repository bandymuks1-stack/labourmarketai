import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An ACCEPTED booking is an agreement. Production walk 2026-09-28: proposing
 * again for the same need and worker reached the same row, and the RPC's upsert
 * rewrote its dates, role and note while leaving it `accepted` — the worker was
 * recorded as agreeing to terms they never saw. The action refuses that before
 * the RPC is ever called; the button says why, in every catalogue.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

describe("an accepted booking is not rewritten by proposing again", () => {
  const src = read("lib/booking/booking-actions.ts");
  const fn = src.slice(src.indexOf("export async function proposeBookingAction("));

  it("the action checks the existing row and refuses `accepted` BEFORE the RPC", () => {
    const check = fn.indexOf('=== "accepted"');
    const refuse = fn.indexOf('return { kind: "already-accepted" }');
    const rpc = fn.indexOf('rpc("propose_booking_request_v3"');
    expect(check).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(check);
    expect(rpc).toBeGreaterThan(refuse);
  });

  it("the stale-workspace refusal still comes first", () => {
    const body = fn.slice(fn.indexOf("{") + 1).trimStart();
    expect(body.startsWith("await refuseStaleWorkspace(")).toBe(true);
  });

  it("the button names the reason in every catalogue", () => {
    expect(read("components/app/propose-booking-button.tsx")).toMatch(/tPropose\("alreadyAccepted"\)/);
    for (const loc of ["lt", "en", "de", "nl", "pl", "ru", "lv", "et", "da", "no", "sv"]) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      expect(typeof m.bookings.propose.alreadyAccepted, loc).toBe("string");
    }
  });
});
