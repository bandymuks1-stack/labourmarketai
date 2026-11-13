import { describe, expect, it } from "vitest";

import {
  RECENT_PLACES_CAP,
  areaPathOf,
  parseRecentPlaces,
  recentPlacesKey,
  recordRecentPlace,
  resolveRecentPlaces,
} from "./recent-places";

describe("a recent place is an AREA, never an entity", () => {
  it.each([
    ["/dashboard/journal", "/dashboard/journal"],
    ["/dashboard/company/people", "/dashboard/company/people"],
    ["/dashboard/projects/11111111-1111-4111-8111-111111111111", "/dashboard/projects"],
    ["/dashboard/projects/11111111-1111-4111-8111-111111111111/hours", "/dashboard/projects"],
    ["/dashboard/communication/42", "/dashboard/communication"],
    ["/dashboard/company/needs?audience=offer#demand-intake", "/dashboard/company/needs"],
  ])("%s → %s", (pathname, area) => {
    expect(areaPathOf(pathname)).toBe(area);
  });

  it.each(["/dashboard", "/", "/cv", "/auth/login", "/dashboard/UPPER", "/dashboard/11111111-1111-4111-8111-111111111111"])(
    "%s is not a recent place",
    (pathname) => {
      expect(areaPathOf(pathname)).toBeNull();
    },
  );
});

describe("the list", () => {
  it("moves a revisited area to the front, once, and is capped", () => {
    let list = recordRecentPlace([], "/dashboard/journal", 1);
    list = recordRecentPlace(list, "/dashboard/planning", 2);
    list = recordRecentPlace(list, "/dashboard/journal", 3);
    expect(list.map((p) => p.path)).toEqual(["/dashboard/journal", "/dashboard/planning"]);
    for (let i = 0; i < 30; i++) list = recordRecentPlace(list, `/dashboard/area-${i}`, 10 + i);
    expect(list).toHaveLength(RECENT_PLACES_CAP);
    // The home and non-dashboard routes are not recorded.
    expect(recordRecentPlace(list, "/dashboard", 99)).toEqual(list);
  });

  it("is kept per user", () => {
    expect(recentPlacesKey("a")).not.toBe(recentPlacesKey("b"));
  });

  it("a malformed or hostile stored value is dropped, never trusted", () => {
    expect(parseRecentPlaces(null)).toEqual([]);
    expect(parseRecentPlaces("not json")).toEqual([]);
    expect(parseRecentPlaces('{"path":"/dashboard/journal"}')).toEqual([]);
    expect(
      parseRecentPlaces(
        JSON.stringify([
          { path: "/dashboard/journal", at: 1 },
          { path: "https://evil.example", at: 2 },
          { path: "/dashboard/projects/11111111-1111-4111-8111-111111111111", at: 3 },
          { path: "/dashboard/planning" },
          null,
        ]),
      ),
    ).toEqual([{ path: "/dashboard/journal", at: 1 }]);
  });
});

describe("what the home draws", () => {
  const destinations = [
    { href: "/dashboard/company", label: "Company" },
    { href: "/dashboard/company/people", label: "My people" },
    { href: "/dashboard/planning", label: "Calendar" },
    { href: "/dashboard/company/needs#demand-intake", label: "Find workers" },
  ];
  const list = [
    { path: "/dashboard/company/people", at: 5 },
    { path: "/dashboard/admin", at: 4 },
    { path: "/dashboard/planning", at: 3 },
    { path: "/dashboard/company/needs", at: 2 },
  ];

  it("only destinations the person is admitted to resolve — a recent path is never a way in", () => {
    const drawn = resolveRecentPlaces(list, destinations, new Set());
    expect(drawn.map((d) => d.label)).toEqual(["My people", "Calendar", "Find workers"]);
    // The operator path the browser remembered has no admitted destination.
    expect(drawn.some((d) => d.href.includes("admin"))).toBe(false);
  });

  it("the deepest destination wins; pinned or on-home ones are skipped; the count is capped", () => {
    expect(resolveRecentPlaces(list, destinations, new Set(["/dashboard/company/people"])).map((d) => d.label)).toEqual([
      "Calendar",
      "Find workers",
    ]);
    expect(resolveRecentPlaces(list, destinations, new Set(), 1)).toHaveLength(1);
    expect(resolveRecentPlaces(list, [], new Set())).toEqual([]);
  });
});
