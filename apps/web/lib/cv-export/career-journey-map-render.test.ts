import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CareerJourneyMap, type CareerJourneyLabels } from "@/components/app/cv/career-journey-map";

import { deriveCareerJourney, type JourneyStationInput } from "./career-journey";

const labels = (patch: Partial<CareerJourneyLabels> = {}): CareerJourneyLabels => ({
  title: "Your career journey",
  summary: "Projects are stops, skills are lines.",
  now: "Now",
  gap: "No records",
  horizon: "Horizon",
  derived: "derived, not a promise",
  linksUnknown: "Couldn't read where your skills were worked",
  level: { confirmed: "confirmed", recorded: "recorded", declared: "declared" },
  focusHint: "Tap a line",
  showAll: "Show all",
  skill: { "panel-install": "Panel installation", "cable-pulling": "Cable pulling", teaching: "Teaching" },
  horizonItem: [{ name: "Solar installer", detail: "you already have 2 of 3 skills" }],
  stationMeta: { a: "2020–2021", b: "2023–Now" },
  ...patch,
});

const st = (p: Partial<JourneyStationInput> & { key: string }): JourneyStationInput => ({
  title: p.key,
  subtitle: null,
  from: "2020-01-01",
  to: "2021-01-01",
  current: false,
  source: "own",
  level: "recorded",
  contextId: null,
  hours: null,
  confirmedHours: null,
  ...p,
});

const journey = (practice: Parameters<typeof deriveCareerJourney>[0]["practice"]) =>
  deriveCareerJourney({
    todayIso: "2026-10-14",
    stations: [
      st({ key: "a", title: "Factory Kaunas", contextId: "ctx-a" }),
      st({ key: "b", title: "School Malmö", from: "2023-01-01", to: null, current: true, contextId: "ctx-b" }),
    ],
    skills: [
      { slug: "panel-install", tier: "confirmed", attributedHours: 420, confirmedHours: 380 },
      { slug: "cable-pulling", tier: "evidence", attributedHours: 120, confirmedHours: 0 },
      { slug: "teaching", tier: "declared", attributedHours: 0, confirmedHours: 0 },
    ],
    practice,
    horizon: [{ professionId: "solar-installer", sharedSkills: ["a", "b"], missingSkills: ["c"] }],
  });

describe("CareerJourneyMap — render", () => {
  const html = renderToStaticMarkup(
    createElement(CareerJourneyMap, {
      journey: journey({ "panel-install": { contextIds: ["ctx-a", "ctx-b"] }, "cable-pulling": { contextIds: ["ctx-a"] } }),
      labels: labels(),
    }),
  );

  it("draws both maps (desktop + phone), the stops and the legend", () => {
    expect(html).toContain('data-testid="cv-journey-map"');
    expect(html).toContain('data-testid="cv-journey-map-phone"');
    expect(html).toContain('data-testid="cv-journey-stop-a"');
    expect(html).toContain("School Malmö");
    expect(html).toContain('data-testid="cv-journey-line-panel-install"');
  });

  it("every legend line names its evidence level in words", () => {
    expect(html).toContain('data-level="confirmed"');
    expect(html).toContain('data-level="recorded"');
    expect(html).toContain('data-level="declared"');
    expect(html).toContain("Panel installation");
  });

  it("the horizon is labelled derived", () => {
    expect(html).toContain("derived, not a promise");
    expect(html).toContain("Solar installer");
  });

  it("never paints green (green means a second party's confirmation)", () => {
    expect(html).not.toMatch(/trust-accent|state-success|state-live/);
  });

  it("every tap target meets the 44px floor", () => {
    expect(html).toMatch(/min-h-11/);
  });

  it("an unread journal says so instead of drawing invented stops", () => {
    const h = renderToStaticMarkup(createElement(CareerJourneyMap, { journey: journey(null), labels: labels() }));
    expect(h).toContain('data-testid="cv-journey-links-unknown"');
  });

  it("nothing to draw → nothing rendered", () => {
    const empty = deriveCareerJourney({ todayIso: "2026-10-14", stations: [], skills: [], practice: {}, horizon: [] });
    expect(renderToStaticMarkup(createElement(CareerJourneyMap, { journey: empty, labels: labels() }))).toBe("");
  });
});
