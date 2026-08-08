import { describe, expect, it } from "vitest";

import {
  buildMonthGrid,
  indicatesExpectedWork,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * D-13 — THE CALENDAR MUST ANSWER "WHICH DAYS DID I FILL, AND WHICH DID I MISS?"
 *
 * The month grid already carried a per-day COUNT, and a count cannot answer
 * either question: a day holding one booking and a day holding one journal
 * entry both render "1". So a worker scanning the month for the days they had
 * logged was reading a number that does not mean what they needed it to mean.
 *
 * These cases pin the two derived facts the cells now carry, and — just as
 * importantly — pin how narrow "unfilled" is allowed to be. A product that
 * marks every empty past day as missing work would nag people about weekends
 * and public holidays it knows nothing about, so `isUnfilled` may only be
 * claimed about a day some real record proves was a working day.
 */

const TODAY = "2026-08-08";

function item(over: Partial<PlanningItem> & Pick<PlanningItem, "id" | "sourceType">): PlanningItem {
  return {
    sourceId: over.id,
    label: null,
    detail: null,
    startDate: null,
    endDate: null,
    status: "x",
    statusKey: "x",
    href: "/dashboard",
    roleContext: "mine",
    startTime: null,
    duration: null,
    workspace: null,
    project: null,
    place: null,
    counterpart: null,
    organization: null,
    ...over,
  } as PlanningItem;
}

const journalOn = (day: string) =>
  item({ id: `journal:${day}`, sourceType: "journal", startDate: day, status: "recorded" });

const acceptedBookingOn = (day: string, endDate?: string) =>
  item({
    id: `booking:${day}`,
    sourceType: "booking",
    startDate: day,
    endDate: endDate ?? null,
    status: "accepted",
    roleContext: "incoming",
  });

/** Find one cell in the grid by its ISO day. */
function cell(day: string, items: readonly PlanningItem[], today = TODAY) {
  const grid = buildMonthGrid(day, items, today);
  const found = grid.weeks.flat().find((c) => c.day === day);
  expect(found, `cell ${day} should be in the grid`).toBeDefined();
  return found!;
}

describe("indicatesExpectedWork — only a PROVEN working day may be called unfilled", () => {
  it("accepts the caller's own accepted incoming booking", () => {
    expect(indicatesExpectedWork(acceptedBookingOn("2026-08-03"))).toBe(true);
  });

  it("accepts a project the caller is personally assigned to", () => {
    expect(
      indicatesExpectedWork(
        item({
          id: "project:1",
          sourceType: "project",
          startDate: "2026-08-03",
          roleContext: "assigned",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a booking that was only PROPOSED — an offer is not a shift", () => {
    expect(
      indicatesExpectedWork(
        item({
          id: "booking:2",
          sourceType: "booking",
          startDate: "2026-08-03",
          status: "proposed",
          roleContext: "incoming",
        }),
      ),
    ).toBe(false);
  });

  it("rejects the company's OUTGOING booking — that is someone else's day", () => {
    expect(
      indicatesExpectedWork(
        item({
          id: "booking:3",
          sourceType: "booking",
          startDate: "2026-08-03",
          status: "accepted",
          roleContext: "outgoing",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a MANAGED project band — the manager was not the one working", () => {
    expect(
      indicatesExpectedWork(
        item({
          id: "project:2",
          sourceType: "project",
          startDate: "2026-08-03",
          roleContext: "managed",
        }),
      ),
    ).toBe(false);
  });

  it.each(["absence", "invitation", "finance", "task", "stage"] as const)(
    "rejects %s — it says nothing about whether a shift happened",
    (sourceType) => {
      expect(
        indicatesExpectedWork(
          item({ id: `${sourceType}:1`, sourceType, startDate: "2026-08-03" }),
        ),
      ).toBe(false);
    },
  );
});

describe("buildMonthGrid — journal marks", () => {
  it("marks the day a journal entry is recorded on", () => {
    expect(cell("2026-08-05", [journalOn("2026-08-05")]).hasJournal).toBe(true);
  });

  it("does NOT mark a day whose only item is a booking", () => {
    // The exact confusion the count could not resolve: same count, different
    // meaning.
    const c = cell("2026-08-05", [acceptedBookingOn("2026-08-05")]);
    expect(c.count).toBe(1);
    expect(c.hasJournal).toBe(false);
  });
});

describe("buildMonthGrid — unfilled marks", () => {
  it("marks a PAST working day that carries no journal entry", () => {
    const c = cell("2026-08-05", [acceptedBookingOn("2026-08-05")]);
    expect(c.isUnfilled).toBe(true);
  });

  it("clears the mark as soon as that day has an entry", () => {
    const c = cell("2026-08-05", [
      acceptedBookingOn("2026-08-05"),
      journalOn("2026-08-05"),
    ]);
    expect(c.hasJournal).toBe(true);
    expect(c.isUnfilled).toBe(false);
  });

  it("never marks a past day with no evidence of work — no nagging about weekends", () => {
    expect(cell("2026-08-02", []).isUnfilled).toBe(false);
  });

  it("never marks TODAY — the day is still being lived", () => {
    expect(cell(TODAY, [acceptedBookingOn(TODAY)]).isUnfilled).toBe(false);
  });

  it("never marks a FUTURE working day — nothing has happened to record yet", () => {
    expect(cell("2026-08-20", [acceptedBookingOn("2026-08-20")]).isUnfilled).toBe(
      false,
    );
  });

  it("marks each past day of a multi-day booking band independently", () => {
    // A week-long booking with one entry logged mid-week: the covered days
    // without an entry are the ones still missing.
    const items = [acceptedBookingOn("2026-08-03", "2026-08-07"), journalOn("2026-08-05")];
    expect(cell("2026-08-04", items).isUnfilled).toBe(true);
    expect(cell("2026-08-05", items).isUnfilled).toBe(false);
    expect(cell("2026-08-06", items).isUnfilled).toBe(true);
  });
});
