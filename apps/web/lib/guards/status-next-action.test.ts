import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { countOwnerResponsesSince } from "../booking/booking-state";

/**
 * Status → next-action guard (root-cause audit PR5).
 *
 * Pins the repaired status flows so no important status regresses to a
 * silent flag or a dead label:
 *   1. "contacted" opens a REAL thread first, then sets the status;
 *   2. the worker sees "contacted" as a link, never a bare chip;
 *   3. real unread = counterpart message newer than last_read (one shared
 *      source for badge, list and bell);
 *   4. booking responses surface via the seen model + dashboard card;
 *   5. the bell renders only real derived signals, each linking the exact
 *      surface that clears it — no local "mark read" for signals;
 *   6. accepted marketplace rows keep their message next step (PR4).
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const LOCALES = ["lt", "en", "ru"] as const;
const catalog = (loc: string) =>
  JSON.parse(read(`messages/${loc}.json`)) as never;

describe("1. contacted → conversation, in that order", () => {
  const action = read("lib/communication/contact-interested-worker.ts");
  it("the action verifies ownership + the worker's own standing interest", () => {
    expect(action).toMatch(/eq\("profile_id", user\.id\)/);
    expect(action).toMatch(/demand_interest_signals/);
    expect(action).toMatch(/interestStatus === "withdrawn"/);
  });
  it("the thread opens BEFORE the status is written (never a false flag)", () => {
    const openIdx = action.indexOf("getOrCreateDirectConversation");
    const ackIdx = action.indexOf('acknowledgeInterest({ requestId, workerId, status: "contacted" })');
    expect(openIdx).toBeGreaterThan(0);
    expect(ackIdx).toBeGreaterThan(openIdx);
    expect(action).toMatch(/allowed_demand_interest/);
  });
  it("the scouting ack uses the thread-opening action for contact", () => {
    const ack = read("components/app/company-interest-ack.tsx");
    expect(ack).toMatch(/contactInterestedWorkerAction/);
    expect(ack).toMatch(/router\.push\(`\/\$\{locale\}\/dashboard\/communication\/\$\{r\.conversationId\}`\)/);
  });
});

describe("2. the worker sees contacted as a connected link", () => {
  it("the interest control links messages when status is contacted", () => {
    const btn = read("components/app/worker-interest-button.tsx");
    expect(btn).toMatch(/status === "contacted" \?/);
    expect(btn).toMatch(/data-testid="interest-contacted-link"/);
    expect(btn).toMatch(/"\/dashboard\/communication"/);
  });
  it("the link copy exists in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as {
        opportunities: { interest: Record<string, string> };
      };
      expect(d.opportunities.interest.contactedLink, loc).toBeTruthy();
    }
  });
});

describe("3. real unread semantics — one shared source", () => {
  const unread = read("lib/communication/unread.ts");
  it("unread compares counterpart messages to last_read_at (not just never-opened)", () => {
    expect(unread).toMatch(/getUnreadConversationIds/);
    expect(unread).toMatch(/neq\("author_id", user\.id\)/);
    expect(unread).toMatch(/Date\.parse\(m\.created_at\) > Date\.parse\(lastRead\)/);
  });
  it("badge count and list rows read the SAME helper", () => {
    expect(unread).toMatch(/getUnreadConversationCount[\s\S]{0,120}getUnreadConversationIds/);
    const list = read("app/[locale]/dashboard/communication/page.tsx");
    expect(list).toMatch(/getUnreadConversationIds/);
    expect(list).toMatch(/unreadIds\.has\(c\.id\)/);
  });
});

describe("4. booking responses are visible, never silent", () => {
  it("the pure counter counts ONLY the other party's responses after seen", () => {
    const rows = [
      { status: "accepted", isOwner: true, updatedAt: "2026-07-06T10:00:00Z" },
      { status: "declined", isOwner: true, updatedAt: "2026-07-06T10:00:00Z" },
      { status: "accepted", isOwner: false, updatedAt: "2026-07-06T10:00:00Z" }, // I responded — not new for me
      { status: "proposed", isOwner: true, updatedAt: "2026-07-06T10:00:00Z" }, // my own proposal
      { status: "accepted", isOwner: true, updatedAt: "2026-07-01T10:00:00Z" }, // before seen
    ] as const;
    expect(countOwnerResponsesSince(rows as never, "2026-07-05T00:00:00Z")).toBe(2);
    expect(countOwnerResponsesSince(rows as never, "not-a-date")).toBe(0);
  });
  it("the dashboard renders the count-gated responses card into both branches", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/data-testid="dashboard-booking-responses-next-action"/);
    expect(page).toMatch(/"\/dashboard\/bookings"/);
    // Org branch: mounted directly. Worker branch (D-01 duplicate removal,
    // Wave 3): promoted into the state-driven top slot when it wins the
    // ladder; otherwise the status-strip chip (same spineCounts number,
    // booking-responses signal → /dashboard/bookings) carries it — the
    // repeated card below the hub is deliberately gone. Responses stay
    // visible either way, never silent.
    expect(page).toMatch(/\{bookingResponsesNextAction\}/);
    expect(page).toMatch(/"booking_response" \? \(\s*bookingResponsesNextAction/);
    expect(page).toMatch(/const bookingResponsesNew = spineCounts\.bookingResponsesNew/);
  });
  it("opening the bookings page IS the read event", () => {
    const bookings = read("app/[locale]/dashboard/bookings/page.tsx");
    expect(bookings).toMatch(/<MarkBookingsSeen \/>/);
    const lib = read("lib/booking/booking-actions.ts");
    expect(lib).toMatch(/mark_booking_requests_seen/);
    expect(lib).toMatch(/booking_requests_seen/);
  });
  it("the seen migration is draft-gated like its marketplace twin", () => {
    const mig = readFileSync(
      join(root, "..", "..", "supabase", "migrations", "20260706120000_booking_requests_seen.sql"),
      "utf8",
    );
    expect(mig).toMatch(/DRAFT — needs-human-gate/);
    expect(mig).toMatch(/security definer/i);
    expect(mig).toMatch(/user_id = auth\.uid\(\)/);
  });
});

describe("5. the bell states only real derived signals", () => {
  it("the layout builds signals from the same real per-surface counts", () => {
    // The per-surface fetches moved into the notification spine (quality-
    // train PR B) and now STREAM (P0 perf): layout → <SpineStream> →
    // getSpineCounts() → the same real helpers.
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).not.toMatch(/notifications:\s*\[\]/);
    expect(layout).toMatch(/<SpineStream/);
    const stream = read("components/app/spine-stream.tsx");
    expect(stream).toMatch(/getSpineCounts\(\)/);
    expect(stream).toMatch(/buildSpineNotifications\(/);
    const spine = read("lib/notifications/spine.ts");
    for (const fn of [
      "getUnreadConversationCount",
      "getPendingIncomingRequestCount",
      "getServiceRequestsNewCounts",
      "getPendingIncomingBookingCount",
      "getBookingResponsesNewCount",
    ]) {
      expect(spine).toMatch(new RegExp(fn));
    }
    // Zero-count signals are dropped — never a fabricated row.
    const spineSignals = read("lib/notifications/spine-signals.ts");
    expect(spineSignals).toMatch(/if \(count <= 0\) return \[\];/);
  });
  it("every signal row navigates to the surface that clears it", () => {
    const panel = read("components/app/notification-panel.tsx");
    expect(panel).toMatch(/n\.href \?/);
    expect(panel).toMatch(/data-testid=\{`notification-signal-\$\{n\.id\}`\}/);
    // "Mark all read" never renders for derived signals.
    expect(panel).toMatch(/notifications\.some\(\(n\) => !n\.href\)/);
  });
  it("signal type labels exist in every active locale", () => {
    for (const loc of LOCALES) {
      const d = catalog(loc) as {
        auth: { notifications: { types: Record<string, string> } };
      };
      for (const k of [
        "unread_messages",
        "incoming_service_requests",
        "service_request_responses",
        "pending_bookings",
        "booking_responses",
      ]) {
        expect(d.auth.notifications.types[k], `${loc}:${k}`).toBeTruthy();
      }
    }
  });
});

describe("6. accepted marketplace rows keep their next step (PR4 continuity)", () => {
  it("both accepted row variants still render the message CTA", () => {
    const loop = read("components/app/marketplace-loop-section.tsx");
    expect(loop).toMatch(/marketplace-outgoing-message-cta/);
    expect(loop).toMatch(/marketplace-incoming-message-cta/);
  });
});
