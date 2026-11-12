import { describe, expect, it } from "vitest";

import {
  HOME_PINS_KEY,
  MAX_HOME_PINS,
  MAX_HOME_RECENT,
  defaultHomePins,
  movePin,
  pinArea,
  pinnableAreas,
  readHomePins,
  resolveHomePins,
  touchRecent,
  unpinArea,
  validateHomePins,
} from "@/lib/home/home-pins";
import { ORGANIZATION_WORK_AREAS, PERSONAL_WORK_AREAS } from "@/lib/navigation/work-areas";

const stored = (pins: unknown, recent: unknown = []) => ({ [HOME_PINS_KEY]: { pins, recent } });

describe("what can be pinned is exactly what the home already offers", () => {
  it("person and company homes pin their own areas, nothing else", () => {
    expect(pinnableAreas("person")).toBe(PERSONAL_WORK_AREAS);
    expect(pinnableAreas("company")).toBe(ORGANIZATION_WORK_AREAS);
  });

  it("a stored id from the other workspace, or an invented one, never renders", () => {
    const read = readHomePins(stored(["journal", "people", "admin", "../x", 7, "cv"]), "person");
    expect(read?.pins).toEqual(["journal", "cv"]);
    const company = readHomePins(stored(["journal", "people"]), "company");
    expect(company?.pins).toEqual(["people"]);
  });

  it("a write naming anything outside the home is refused, not trimmed", () => {
    expect(validateHomePins({ pins: ["journal", "people"], recent: [] }, "person")).toBeNull();
    expect(validateHomePins({ pins: ["journal"], recent: ["admin"] }, "person")).toBeNull();
    expect(validateHomePins({ pins: ["journal", "journal"], recent: [] }, "person")).toBeNull();
    expect(validateHomePins({ pins: "journal", recent: [] }, "person")).toBeNull();
    expect(validateHomePins(null, "person")).toBeNull();
    expect(validateHomePins({ pins: ["journal", "cv"], recent: ["cv"] }, "person")).toEqual({
      pins: ["journal", "cv"],
      recent: ["cv"],
    });
  });

  it("the stored list is bounded", () => {
    const all = ORGANIZATION_WORK_AREAS.map((a) => a.id);
    expect(readHomePins(stored(all, all), "company")?.pins).toHaveLength(MAX_HOME_PINS);
    expect(readHomePins(stored(all, all), "company")?.recent).toHaveLength(MAX_HOME_RECENT);
    expect(validateHomePins({ pins: all, recent: [] }, "company")).toBeNull();
  });
});

describe("defaults depend on the role, until the person chooses", () => {
  it.each([
    ["worker", "person"],
    ["company", "company"],
    ["agency", "company"],
  ] as const)("%s defaults are real areas of the %s home", (role, context) => {
    const ids = new Set(pinnableAreas(context).map((a) => a.id));
    const defaults = defaultHomePins(role);
    expect(defaults.length).toBeGreaterThan(0);
    for (const id of defaults) expect(ids.has(id), `${role}: ${id}`).toBe(true);
  });

  it("company and agency start differently", () => {
    expect(defaultHomePins("company")).not.toEqual(defaultHomePins("agency"));
  });

  it("never chosen → defaults; chosen (even empty) → the person's choice", () => {
    expect(readHomePins(null, "person")).toBeNull();
    expect(readHomePins({}, "person")).toBeNull();
    expect(resolveHomePins(null, "person", "worker").pins).toEqual([...defaultHomePins("worker")]);
    const emptied = readHomePins(stored([]), "person");
    expect(resolveHomePins(emptied, "person", "worker").pins).toEqual([]);
  });
});

describe("pin, unpin, reorder, recent", () => {
  const base = { pins: ["journal", "cv"], recent: [] as string[] };

  it("pins once and respects the limit", () => {
    expect(pinArea(base, "gallery").pins).toEqual(["journal", "cv", "gallery"]);
    expect(pinArea(base, "cv")).toBe(base);
    const full = { pins: Array.from({ length: MAX_HOME_PINS }, (_, i) => `a${i}`), recent: [] };
    expect(pinArea(full, "x")).toBe(full);
  });

  it("unpins", () => {
    expect(unpinArea(base, "journal").pins).toEqual(["cv"]);
  });

  it("moves one place and stops at the ends", () => {
    expect(movePin(base, "cv", -1).pins).toEqual(["cv", "journal"]);
    expect(movePin(base, "journal", -1)).toBe(base);
    expect(movePin(base, "cv", 1)).toBe(base);
    expect(movePin(base, "nope", 1)).toBe(base);
  });

  it("recent is newest first, unique and bounded", () => {
    let s = base;
    for (const id of ["a", "b", "a", "c", "d", "e"]) s = touchRecent(s, id);
    expect(s.recent).toEqual(["e", "d", "c", "a"]);
  });
});
