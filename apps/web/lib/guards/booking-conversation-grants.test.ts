import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_PERMISSION_STATES,
  type ContactPermissionState,
} from "@/lib/communication/communication-eligibility";

/**
 * BOOKING CONVERSATION-GRANT dedup/grant regression guard (PR 5).
 *
 * The one-conversation-per-relationship model rests on three facts this guard
 * pins so they cannot regress silently:
 *
 *   1. CALLER SET IS CLOSED — every getOrCreateDirectConversation caller under
 *      lib/ is known. The four gated context callers each pass their own exact
 *      allowed_* grant AND their own typed sourceHint; the single generic open
 *      action passes neither (permission is resolved server-side inside
 *      getOrCreateDirectConversation, default-closed). A new caller must
 *      consciously edit this list.
 *   2. BOOKING GATE ORDER — lib/booking/booking-conversation.ts re-verifies
 *      the booking row is status='accepted' SERVER-SIDE before the grant or
 *      the conversation open ever runs (§8.1 twin).
 *   3. NO 'expired' WRITER — booking-state.ts stays a pure display/decision
 *      module: no .update(), no .rpc(), no path that could ever stamp the
 *      reserved (writer-less) `expired` status. The derived display state
 *      labels a stale proposal "no response yet" — never "expired".
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

/** The four gated context callers: file → [exact grant, exact sourceHint type]. */
const GATED_CALLERS: ReadonlyArray<
  readonly [string, ContactPermissionState, string]
> = [
  [
    "lib/booking/booking-conversation.ts",
    "allowed_accepted_booking",
    "accepted_booking",
  ],
  [
    "lib/communication/contact-interested-worker.ts",
    "allowed_demand_interest",
    "demand_interest",
  ],
  [
    "lib/communication/request-worker-conversation.ts",
    "allowed_scouting_shortlist",
    "scouting",
  ],
  [
    "lib/marketplace/service-request-conversation.ts",
    "allowed_accepted_service_request",
    "accepted_service_request",
  ],
];

/** The single generic caller — no grant literal, no sourceHint; permission is
 *  resolved server-side inside getOrCreateDirectConversation itself. */
const GENERIC_CALLER = "lib/communication/open-conversation-action.ts";

/** Where getOrCreateDirectConversation is defined (not a caller). */
const DEFINITION = "lib/communication/direct-conversation.ts";

/** All non-test .ts(x) sources under lib/. */
function walkLib(): string[] {
  const out: string[] = [];
  const stack = ["lib"];
  while (stack.length > 0) {
    const rel = stack.pop() as string;
    for (const name of readdirSync(join(APP, rel))) {
      const childRel = `${rel}/${name}`;
      if (statSync(join(APP, childRel)).isDirectory()) {
        stack.push(childRel);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
      out.push(childRel);
    }
  }
  return out;
}

// ── 1. Closed caller set: exact grant + typed sourceHint per gated caller ──

describe("getOrCreateDirectConversation callers in lib/ are a closed, grant-typed set", () => {
  it("the caller set is exactly the four gated callers + the one generic action", () => {
    const callers = walkLib()
      .filter((rel) => rel !== DEFINITION)
      .filter((rel) => /getOrCreateDirectConversation\(/.test(read(rel)));
    expect(callers.sort()).toEqual(
      [...GATED_CALLERS.map(([rel]) => rel), GENERIC_CALLER].sort(),
    );
  });

  for (const [rel, grant, hintType] of GATED_CALLERS) {
    it(`${rel} passes its exact allowed_* grant ('${grant}') and typed sourceHint ('${hintType}')`, () => {
      const src = read(rel);
      expect(src).toMatch(new RegExp(`"${grant}"`));
      expect(src).toMatch(new RegExp(`\\{\\s*type:\\s*"${hintType}",\\s*id:`));
      // The grant is a real member of the §8.1 enumeration and allowed_*.
      expect(CONTACT_PERMISSION_STATES).toContain(grant);
      expect(grant.startsWith("allowed_")).toBe(true);
      // No OTHER allowed_* grant literal appears in the caller — one
      // relationship, one grant.
      for (const other of CONTACT_PERMISSION_STATES) {
        if (other === grant || !other.startsWith("allowed_")) continue;
        // allowed_existing_conversation may be MENTIONED in comments only —
        // strip comments before asserting.
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
        expect(code, `${rel} must not pass '${other}'`).not.toContain(
          `"${other}"`,
        );
      }
    });
  }

  it("the generic open action passes NO grant literal and NO sourceHint", () => {
    const src = read(GENERIC_CALLER);
    expect(src).not.toMatch(/"allowed_[a-z_]+"/);
    expect(src).not.toMatch(/sourceHint|source_type|source_id/);
    // It calls with exactly (profileId, locale) — the default-closed
    // server-side permission resolution inside the definition applies.
    expect(src).toMatch(/getOrCreateDirectConversation\(profileId, locale\)/);
  });

  it("the definition itself stays default-closed (no_permission fails the open)", () => {
    const src = read(DEFINITION);
    expect(src).toMatch(/isContactPermitted\(grantedPermission\)/);
    expect(src).toMatch(/resolveContactPermission\(otherProfileId\)/);
    expect(src).toMatch(/code: "no_permission"/);
  });
});

// ── 2. Booking conversation: accepted re-verified server-side, in order ────

describe("booking-conversation re-verifies status='accepted' server-side before opening", () => {
  const src = read("lib/booking/booking-conversation.ts");

  it("is a server action that reads the booking row itself", () => {
    expect(src).toMatch(/^"use server";/);
    expect(src).toMatch(/\.from\("booking_requests"\)/);
  });

  it("the accepted gate runs BEFORE the grant and the conversation open", () => {
    const gate = src.indexOf('booking.status !== "accepted"');
    const grant = src.indexOf('"allowed_accepted_booking"');
    const open = src.indexOf("getOrCreateDirectConversation(");
    expect(gate).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(gate);
    expect(open).toBeGreaterThan(gate);
    // Failure path is the honest cannot_open notice, never a silent bounce.
    expect(src).toMatch(
      /booking\.status !== "accepted"\) redirect\(cannotOpen\)/,
    );
  });

  it("only a real participant (owner or booked worker) resolves a counterpart", () => {
    expect(src).toMatch(/user!\.id === booking!\.owner_id/);
    expect(src).toMatch(/user!\.id === workerProfileId/);
    expect(src).toMatch(/if \(!counterpart\) redirect\(cannotOpen\)/);
  });
});

// ── 3. booking-state.ts has NO writer of 'expired' (display-only truth) ────

describe("booking-state.ts contains no writer of 'expired' — display-only module", () => {
  const src = read("lib/booking/booking-state.ts");

  it("stays pure: no imports, no supabase, no .update(), no .rpc(), no fetch", () => {
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/supabase|createClient/i);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/\.insert\(|\.upsert\(|\.delete\(/);
    expect(src).not.toMatch(/fetch\(/);
  });

  it("no update/rpc payload could ever set status to 'expired'", () => {
    expect(src).not.toMatch(/\.update\([^)]*expired/);
    expect(src).not.toMatch(/\.rpc\([^)]*expired/);
    expect(src).not.toMatch(/status\s*[:=]\s*["']expired["']/);
  });

  it("the derived display state maps a stale proposal to 'no_response_stale', never 'expired'", () => {
    expect(src).toMatch(/export function deriveBookingDisplayState/);
    expect(src).toMatch(/"no_response_stale"/);
    expect(src).toMatch(/export const STALE_AFTER_DAYS = 14/);
    // Inside the derive function, the literal "expired" never appears — a
    // stale proposal can only ever be LABELLED stale, not re-statused.
    const fnStart = src.indexOf("export function deriveBookingDisplayState");
    const fnEnd = src.indexOf("}", src.indexOf("return now - created"));
    const fn = src.slice(fnStart, fnEnd + 1);
    expect(fn).not.toMatch(/["']expired["']/);
  });

  it("the stale display copy says 'no response yet' — never 'expired' (lt/en/ru/nl/de)", () => {
    for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {
      const messages = JSON.parse(read(`messages/${loc}.json`)) as {
        bookings: { displayState: Record<string, string>; status: Record<string, string> };
      };
      const stale = messages.bookings.displayState.no_response_stale;
      expect(stale?.trim().length, `${loc}: displayState.no_response_stale`).toBeGreaterThan(0);
      // The honest label must differ from the (unreachable) expired status label.
      expect(stale, loc).not.toBe(messages.bookings.status.expired);
    }
  });
});
