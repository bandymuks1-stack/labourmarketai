import { describe, expect, it } from "vitest";
import { ORGANIZATION_DOOR_ROUTES } from "@/lib/company/organization-doors";
import { ORGANIZATION_WORK_AREAS } from "@/lib/navigation/work-areas";

/**
 * ONE DOOR, ONE ROUTE (coordinator ruling 2026-11-03, after #2995).
 *
 * The organization's doors are listed twice: `ORGANIZATION_DOOR_ROUTES` (the
 * company pages' door strip) and `ORGANIZATION_WORK_AREAS` (the area switcher
 * and the header's "More"). Until the P1 unification they must never send the
 * same door to two different routes — "Kalendorius" led to the calendar from
 * one list and to the capacity zone from the other, "Rinka" to two different
 * marketplace pages.
 *
 * The lists name some doors differently, so they are compared by CONCEPT.
 * `work` is the one id both lists use for DIFFERENT things (the door strip's
 * "Darbai" are the projects; the area "Darbas ir valandos" is the hours), so
 * it is mapped explicitly rather than compared by name.
 */
const SAME_DOOR: Readonly<Record<string, keyof typeof ORGANIZATION_DOOR_ROUTES>> = {
  people: "people",
  projects: "work",
  need: "needs",
  market: "market",
  calendar: "calendar",
  clients: "partners",
  history: "history",
};
/** Areas with no door of their own in the strip (each a distinct capability). */
const AREA_ONLY = new Set(["offer", "messages", "candidates", "capacity", "work", "results"]);

describe("the two organization door lists agree", () => {
  const area = new Map(ORGANIZATION_WORK_AREAS.map((a) => [a.id, a.href]));

  for (const [areaId, doorId] of Object.entries(SAME_DOOR)) {
    it(`${areaId} (area) and ${doorId} (door) lead to the same route`, () => {
      expect(area.get(areaId), areaId).toBe(ORGANIZATION_DOOR_ROUTES[doorId]);
    });
  }

  it("every area is either a shared door or a declared area-only capability", () => {
    for (const a of ORGANIZATION_WORK_AREAS) {
      expect(a.id in SAME_DOOR || AREA_ONLY.has(a.id), a.id).toBe(true);
    }
  });

  it("no two shared doors share a route, and the calendar is the one calendar", () => {
    const routes = Object.values(SAME_DOOR).map((d) => ORGANIZATION_DOOR_ROUTES[d]);
    expect(new Set(routes).size).toBe(routes.length);
    expect(ORGANIZATION_DOOR_ROUTES.calendar).toBe("/dashboard/planning");
    expect(area.get("capacity")).toBe("/dashboard/company/planning");
  });
});
