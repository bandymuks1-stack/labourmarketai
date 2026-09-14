import { describe, expect, it } from "vitest";

import {
  PLANNED_TRIP_STATUSES,
  isConflictEligible,
  projectTripItem,
} from "@/lib/planning/planning-model";
import { reserveCapacity, type HeldTime } from "@/lib/workforce/commitment-reservation";
import { measureUtilisation } from "@/lib/workforce/utilisation";
import { TRIP_STATUSES } from "@/lib/trips/trips-model";

/**
 * A TRIP OCCUPIES TIME, OR IT DOES NOT — and every consumer must give the
 * same answer.
 *
 * This product has been bitten before by one fact with several homes: three
 * computations once returned 0 h, 5 h and 9 h for the same journal entry. A
 * business trip now feeds FOUR consumers — the person's own calendar, the
 * employer's capacity answer, the CAL-7 reservation verdict and the CAL-9
 * utilisation window — and each of them asks the same question. If they could
 * answer it differently, a person would be away on one screen and free on the
 * next.
 *
 * So `PLANNED_TRIP_STATUSES` is the single home of the rule, and this file
 * checks the consumers AGREE rather than merely that each looks reasonable
 * alone. The employer read is IO, so its agreement is pinned by source in
 * `lib/guards/capacity-reservation.test.ts` (it imports the same constant);
 * everything pure is exercised here for real.
 */

const TRIP = { id: "t1", destination: "Rotterdam", startDate: "2026-10-05", endDate: "2026-10-09" };

const heldFromTrip = (): HeldTime => ({
  source: "trip",
  sourceId: TRIP.id,
  label: TRIP.destination,
  startDate: TRIP.startDate,
  endDate: TRIP.endDate,
});

describe("one rule decides whether a trip occupies time", () => {
  it("covers every status the trips model can produce — no silent third case", () => {
    // If a new status is ever added to the domain, this fails until somebody
    // decides which side of the line it falls on.
    for (const status of TRIP_STATUSES) {
      const occupies = (PLANNED_TRIP_STATUSES as readonly string[]).includes(status);
      const item = projectTripItem({ ...TRIP, status });
      expect(
        item !== null,
        `${status}: the calendar and the rule disagree about whether this occupies time`,
      ).toBe(occupies);
    }
  });

  it("approved and completed occupy time; draft, submitted, rejected and cancelled do not", () => {
    expect([...PLANNED_TRIP_STATUSES]).toEqual(["approved", "completed"]);
    for (const status of ["draft", "submitted", "rejected", "cancelled"]) {
      expect(projectTripItem({ ...TRIP, status }), status).toBeNull();
    }
  });

  it("a trip that occupies time also competes for it", () => {
    // Drawing a band on the calendar and then not counting it as a conflict
    // would be the same fact rendered twice with two meanings.
    for (const status of TRIP_STATUSES) {
      const item = projectTripItem({ ...TRIP, status });
      if (!item) continue;
      expect(isConflictEligible(item), `${status} draws but does not conflict`).toBe(true);
    }
  });
});

describe("the reservation verdict and the calendar agree", () => {
  it("a trip collides exactly where the calendar would draw it", () => {
    const verdict = reserveCapacity({
      window: { startDate: "2026-10-08", endDate: "2026-10-12" },
      held: [heldFromTrip()],
    });
    expect(verdict.state).toBe("collides");
    expect(verdict.collisions[0].overlapStart).toBe("2026-10-08");
    expect(verdict.collisions[0].overlapEnd).toBe("2026-10-09");
    expect(verdict.collisions[0].source).toBe("trip");
  });

  it("a trip outside the window collides with nothing", () => {
    const verdict = reserveCapacity({
      window: { startDate: "2026-11-01", endDate: "2026-11-05" },
      held: [heldFromTrip()],
    });
    expect(verdict.state).toBe("clear");
  });

  it("the destination survives to the verdict and the purpose never exists to leak", () => {
    const verdict = reserveCapacity({
      window: { startDate: "2026-10-05", endDate: "2026-10-09" },
      held: [heldFromTrip()],
    });
    expect(verdict.collisions[0].label).toBe("Rotterdam");
    expect(Object.keys(verdict.collisions[0])).not.toContain("purpose");
  });
});

describe("utilisation counts a trip exactly as it counts any other commitment", () => {
  const window = { startDate: "2026-10-01", endDate: "2026-10-30" };

  it("five trip days are five committed days, not unavailable ones", () => {
    // A trip is WORK done elsewhere, not leave. Counting it as unavailability
    // would say the person cannot be planned when in fact they are planned.
    const u = measureUtilisation({ workerId: "w1", window, held: [heldFromTrip()] });
    expect(u.committedDays).toBe(5);
    expect(u.unavailableDays).toBe(0);
    expect(u.freeDays).toBe(25);
  });

  it("a trip and a project on the same days are ONE committed day each", () => {
    const u = measureUtilisation({
      workerId: "w1",
      window,
      held: [
        heldFromTrip(),
        { source: "project", sourceId: "p1", label: "Site", startDate: "2026-10-05", endDate: "2026-10-09" },
      ],
    });
    expect(u.committedDays).toBe(5);
  });

  it("a trip and a project of equal length count identically — the source does not change the arithmetic", () => {
    const asTrip = measureUtilisation({ workerId: "w1", window, held: [heldFromTrip()] });
    const asProject = measureUtilisation({
      workerId: "w1",
      window,
      held: [{ ...heldFromTrip(), source: "project" }],
    });
    expect(asTrip.committedDays).toBe(asProject.committedDays);
    expect(asTrip.committedRatio).toBe(asProject.committedRatio);
  });
});
