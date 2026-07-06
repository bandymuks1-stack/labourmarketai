import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { CONTACT_PERMISSION_STATES } from "@/lib/communication/communication-eligibility";
import {
  BOOKING_TERMINAL,
  canTransitionBooking,
  type BookingActor,
  type BookingStatus,
} from "../booking/booking-state";

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
const ACTIONS = read("lib/booking/booking-actions.ts");

const ALL_STATUSES: readonly BookingStatus[] = [
  "proposed",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
];
const ALL_ACTORS: readonly BookingActor[] = ["company", "worker", "system"];
const LOCALES = ["lt", "en", "ru"] as const;

const bookingsNamespace = (loc: string): Record<string, unknown> =>
  (JSON.parse(read(`messages/${loc}.json`)) as { bookings: Record<string, unknown> })
    .bookings;

const flattenKeys = (o: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

// The page renders the worker list (incoming) before the company list
// (outgoing) — slice the source so placement assertions can tell them apart.
const INCOMING_START = PAGE.indexOf('title={t("incoming.title")}');
const OUTGOING_START = PAGE.indexOf('title={t("outgoing.title")}');
const INCOMING = PAGE.slice(INCOMING_START, OUTGOING_START);
const OUTGOING = PAGE.slice(OUTGOING_START);

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

  it("each message CTA lives in its own list — worker and company both get the next step", () => {
    expect(INCOMING_START).toBeGreaterThan(-1);
    expect(OUTGOING_START).toBeGreaterThan(INCOMING_START);
    expect(INCOMING).toMatch(/booking-incoming-message-cta/);
    expect(INCOMING).not.toMatch(/booking-outgoing-message-cta/);
    expect(OUTGOING).toMatch(/booking-outgoing-message-cta/);
  });

  it("the declined→scouting bridge is a company affordance, never shown to the worker", () => {
    expect(OUTGOING).toMatch(/booking-declined-next-action/);
    expect(INCOMING).not.toMatch(/booking-declined-next-action/);
    expect(INCOMING).not.toMatch(/dashboard\/company\/scouting/);
  });

  it("every status the page can receive renders a translated chip (typed exhaustive)", () => {
    // Record<BookingStatus, string> makes TS fail the build if a status loses
    // its tone; the t(`status.${row.status}`) call keys the label off the row.
    expect(PAGE).toMatch(/STATUS_TONE: Record<BookingStatus, string>/);
    expect(PAGE).toMatch(/t\(`status\.\$\{row\.status\}` as never\)/);
    for (const loc of LOCALES) {
      const status = bookingsNamespace(loc).status as Record<string, string>;
      for (const s of ALL_STATUSES) {
        expect(status[s]?.trim().length, `${loc}: bookings.status.${s}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("withdraw exists ONLY where the lifecycle allows it (company × proposed)", () => {
  it("the worker's incoming list has no withdraw affordance at all", () => {
    expect(INCOMING).not.toMatch(/BookingWithdrawButton|actions\.withdraw/);
  });

  it("the withdraw button mounts exactly once — inside the outgoing proposed branch", () => {
    expect(PAGE.match(/<BookingWithdrawButton/g)).toHaveLength(1);
    expect(OUTGOING).toMatch(
      /row\.status === "proposed" \? \(\s*(?:\/\/[^\n]*\n\s*)*<BookingWithdrawButton/,
    );
  });

  it("companies get no accept/decline buttons (acceptance is a real WORKER action)", () => {
    expect(PAGE.match(/<BookingRespondButtons/g)).toHaveLength(1);
    expect(INCOMING).toMatch(/<BookingRespondButtons/);
    expect(OUTGOING).not.toMatch(/BookingRespondButtons/);
  });

  it("the state machine backs the UI: withdrawn is reachable only by company from proposed", () => {
    for (const from of ALL_STATUSES) {
      for (const by of ALL_ACTORS) {
        expect(
          canTransitionBooking(from, "withdrawn", by),
          `${from} → withdrawn by ${by}`,
        ).toBe(from === "proposed" && by === "company");
      }
    }
  });
});

describe("the transition matrix is default-closed — exactly the documented moves", () => {
  // The lifecycle doc's whole table, pinned: proposed fans out to the four
  // responses (each owned by exactly one actor) and every terminal status is
  // inert. Any new transition must consciously edit this guard AND the doc.
  const DOCUMENTED = new Set([
    "proposed→accepted→worker",
    "proposed→declined→worker",
    "proposed→withdrawn→company",
    "proposed→expired→system",
  ]);

  it("all 75 from×to×actor combinations agree with the documented table", () => {
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        for (const by of ALL_ACTORS) {
          const key = `${from}→${to}→${by}`;
          expect(canTransitionBooking(from, to, by), key).toBe(DOCUMENTED.has(key));
        }
      }
    }
  });

  it("the terminal set is exactly the four post-proposed statuses", () => {
    expect([...BOOKING_TERMINAL].sort()).toEqual([
      "accepted",
      "declined",
      "expired",
      "withdrawn",
    ]);
  });

  it("the worker response action is type-narrowed to accepted|declined only", () => {
    // respondBookingAction cannot be handed "withdrawn"/"expired" — the
    // decision param is an Extract over the union, enforced at compile time.
    expect(ACTIONS).toMatch(/Extract<BookingStatus, "accepted" \| "declined">/);
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
    for (const loc of LOCALES) {
      const blob = JSON.stringify(bookingsNamespace(loc)).toLowerCase();
      // No countdown / auto-lapse claims — the system has no scheduler.
      expect(blob, loc).not.toMatch(
        /expires (in|on|soon)|will expire|galios iki|nustos galioti|истекает через|скоро истечет/,
      );
    }
  });

  it("no server action can write 'expired' — the only writers are propose/respond/withdraw", () => {
    // The respond RPC receives a compile-time-narrowed decision (see the
    // matrix guard); beyond that, the literal never appears in the actions
    // file, so no code path can stamp the system-only status.
    expect(ACTIONS).not.toMatch(/expired/);
    expect(ACTION).not.toMatch(/expired/);
  });

  it("no booking migration installs a cron/scheduler (the doc's claim stays true)", () => {
    const dir = join(ROOT, "..", "..", "supabase", "migrations");
    for (const file of readdirSync(dir)) {
      const sql = readFileSync(join(dir, file), "utf8");
      if (!/booking/i.test(sql)) continue;
      expect(sql, file).not.toMatch(/pg_cron|cron\.schedule/i);
    }
  });

  it("the lifecycle decision is documented for the owner", () => {
    const doc = read("../../docs/launch/booking-lifecycle-v1.md");
    expect(doc).toMatch(/no scheduler, trigger or cron exists/);
    expect(doc).toMatch(/allowed_accepted_booking/);
    // The status map keeps expired marked unreachable on both sides.
    expect(doc).toMatch(/expired \| — unreachable — \| — unreachable —/);
  });
});

describe("new lifecycle copy exists in every served locale", () => {
  for (const loc of LOCALES) {
    it(`${loc}: every bookings.actions key the page renders is non-empty`, () => {
      const actions = bookingsNamespace(loc).actions as Record<string, string>;
      for (const key of [
        "accept",
        "accepted",
        "conflict",
        "decline",
        "declined",
        "error",
        "findAnother",
        "message",
        "withdraw",
      ]) {
        expect(
          actions[key]?.trim().length,
          `${loc}: bookings.actions.${key}`,
        ).toBeGreaterThan(0);
      }
    });
  }

  it("lt/en/ru expose an IDENTICAL bookings key set — no locale drifts", () => {
    const [lt, en, ru] = LOCALES.map((loc) =>
      flattenKeys(bookingsNamespace(loc)).sort().join("\n"),
    );
    expect(en, "en vs lt").toBe(lt);
    expect(ru, "ru vs lt").toBe(lt);
  });
});
