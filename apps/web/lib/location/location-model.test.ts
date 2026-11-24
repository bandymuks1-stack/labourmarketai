import { describe, expect, it } from "vitest";
import {
  RADIUS_OPTIONS,
  DEFAULT_RADIUS_KM,
  hasCoords,
  isUsableForSearch,
  normalizeRadius,
  validateSelectedLocation,
  summarizeLocation,
  type SelectedLocation,
} from "./location-model";

const auto: SelectedLocation = { source: "auto", lat: 54.687, lng: 25.28, country: null, region: null, address: null, radiusKm: 25, savedAt: 1 };
const manual: SelectedLocation = { source: "manual", lat: null, lng: null, country: "LT", region: "Vilnius", address: null, radiusKm: 50, savedAt: 1 };

describe("radius options", () => {
  it("are exactly 10/25/50/100 with a 25 km default", () => {
    expect([...RADIUS_OPTIONS]).toEqual([10, 25, 50, 100]);
    expect(DEFAULT_RADIUS_KM).toBe(25);
  });
  it("normalizeRadius snaps to the nearest option", () => {
    expect(normalizeRadius(5)).toBe(10);
    expect(normalizeRadius(30)).toBe(25);
    expect(normalizeRadius(60)).toBe(50);
    expect(normalizeRadius(999)).toBe(100);
  });
});

describe("usability (provider-free)", () => {
  it("auto coords are usable", () => {
    expect(hasCoords(auto)).toBe(true);
    expect(isUsableForSearch(auto)).toBe(true);
  });
  it("manual country (no coords) is usable", () => {
    expect(hasCoords(manual)).toBe(false);
    expect(isUsableForSearch(manual)).toBe(true);
  });
  it("nothing chosen is not usable", () => {
    expect(isUsableForSearch({ ...manual, country: null, region: null })).toBe(false);
  });
});

describe("validation", () => {
  it("accepts a valid auto + manual location", () => {
    expect(validateSelectedLocation(auto)).toBe(true);
    expect(validateSelectedLocation(manual)).toBe(true);
  });
  it("rejects a bad radius or empty (no coords + no country)", () => {
    expect(validateSelectedLocation({ ...auto, radiusKm: 33 })).toBe(false);
    expect(validateSelectedLocation({ ...manual, country: null })).toBe(false);
    expect(validateSelectedLocation(null)).toBe(false);
  });
});

describe("summary", () => {
  it("summarizes source/radius/usable/where", () => {
    expect(summarizeLocation(manual)).toMatchObject({ source: "manual", radiusKm: 50, hasCoords: false, usable: true });
    expect(summarizeLocation(auto).where).toMatch(/54\.6/);
  });
});