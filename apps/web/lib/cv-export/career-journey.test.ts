import { describe, expect, it } from "vitest";

import {
  GAP_MIN_DAYS,
  JOURNEY_LINES_MAX,
  deriveCareerJourney,
  type JourneySkillInput,
  type JourneyStationInput,
} from "./career-journey";

const st = (patch: Partial<JourneyStationInput> & { key: string }): JourneyStationInput => ({
  title: patch.key,
  subtitle: null,
  from: "2024-01-01",
  to: "2024-06-30",
  current: false,
  source: "own",
  level: "recorded",
  contextId: null,
  hours: null,
  confirmedHours: null,
  ...patch,
});
const skill = (slug: string, tier: JourneySkillInput["tier"], hours = 10): JourneySkillInput => ({
  slug,
  tier,
  attributedHours: hours,
  confirmedHours: tier === "confirmed" ? hours / 2 : 0,
});
const TODAY = "2026-10-14";

describe("career journey — stops come only from journal links", () => {
  it("a line stops where its entries' engagement context is — never by overlapping dates", () => {
    const j = deriveCareerJourney({
      stations: [
        st({ key: "a", contextId: "ctx-a", from: "2024-01-01", to: "2024-12-31" }),
        st({ key: "b", contextId: "ctx-b", from: "2024-03-01", to: "2024-09-30" }),
      ],
      skills: [skill("panel-install", "confirmed")],
      practice: { "panel-install": { contextIds: ["ctx-b"] } },
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.lines[0].stops).toEqual(["b"]);
    expect(j.stations.find((s) => s.key === "a")!.lines).toEqual([]);
    expect(j.stations.find((s) => s.key === "b")!.lines).toEqual(["panel-install"]);
  });

  it("a declared skill is a hollow stub: no stops even if a context matches", () => {
    const j = deriveCareerJourney({
      stations: [st({ key: "a", contextId: "ctx-a" })],
      skills: [skill("teaching", "declared")],
      practice: { teaching: { contextIds: ["ctx-a"] } },
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.lines[0]).toMatchObject({ level: "declared", stops: [] });
  });

  it("an unread journal (practice null) is UNKNOWN: no stops, flagged", () => {
    const j = deriveCareerJourney({
      stations: [st({ key: "a", contextId: "ctx-a" })],
      skills: [skill("x", "confirmed")],
      practice: null,
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.linksUnknown).toBe(true);
    expect(j.lines[0].stops).toEqual([]);
  });

  it("organization history without a context link is a station with no lines", () => {
    const j = deriveCareerJourney({
      stations: [st({ key: "org:1", source: "organization", level: "confirmed", contextId: null })],
      skills: [skill("x", "confirmed")],
      practice: { x: { contextIds: ["ctx-a"] } },
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.stations[0].lines).toEqual([]);
  });
});

describe("career journey — time axis, gaps, current stop", () => {
  it("stations are ordered by time; a current stop runs to today", () => {
    const j = deriveCareerJourney({
      stations: [
        st({ key: "late", from: "2026-01-12", to: null, current: true }),
        st({ key: "early", from: "2019-01-01", to: "2019-12-31" }),
      ],
      skills: [],
      practice: {},
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.stations.map((s) => s.key)).toEqual(["early", "late"]);
    expect(j.axisStart).toBe("2019-01-01");
    expect(j.axisEnd).toBe(TODAY);
  });

  it("a stretch longer than GAP_MIN_DAYS with no stop is a gap; overlaps are not gaps", () => {
    const j = deriveCareerJourney({
      stations: [
        st({ key: "a", from: "2020-01-01", to: "2020-12-31" }),
        st({ key: "b", from: "2020-06-01", to: "2021-01-15" }),
        st({ key: "c", from: "2021-07-01", to: "2022-01-01" }),
      ],
      skills: [],
      practice: {},
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.gaps).toHaveLength(1);
    expect(j.gaps[0]).toMatchObject({ from: "2021-01-15", to: "2021-07-01" });
    expect(j.gaps[0].toDay - j.gaps[0].fromDay).toBeGreaterThan(GAP_MIN_DAYS);
  });

  it("undated stations are kept for the list, never placed on the axis", () => {
    const j = deriveCareerJourney({
      stations: [st({ key: "u", from: null, to: null })],
      skills: [],
      practice: {},
      horizon: [],
      todayIso: TODAY,
    });
    expect(j.stations).toEqual([]);
    expect(j.undated.map((s) => s.key)).toEqual(["u"]);
    expect(j.axisStart).toBeNull();
  });
});

describe("career journey — lines and horizon", () => {
  it("lines list evidence first, then hours; capped", () => {
    const skills = [
      skill("d", "declared", 0),
      skill("r-small", "evidence", 5),
      skill("c", "confirmed", 1),
      skill("r-big", "evidence", 50),
      ...Array.from({ length: JOURNEY_LINES_MAX }, (_, i) => skill(`extra${i}`, "evidence", 1)),
    ];
    const j = deriveCareerJourney({ stations: [], skills, practice: {}, horizon: [], todayIso: TODAY });
    expect(j.lines).toHaveLength(JOURNEY_LINES_MAX);
    expect(j.lines.slice(0, 3).map((l) => l.slug)).toEqual(["c", "r-big", "r-small"]);
  });

  it("every horizon item is marked derived", () => {
    const j = deriveCareerJourney({
      stations: [],
      skills: [],
      practice: {},
      horizon: [{ professionId: "solar-installer", sharedSkills: ["a", "b"], missingSkills: ["c"] }],
      todayIso: TODAY,
    });
    expect(j.horizon).toEqual([
      { professionId: "solar-installer", sharedSkills: ["a", "b"], missingSkills: ["c"], basis: "derived" },
    ]);
  });
});
