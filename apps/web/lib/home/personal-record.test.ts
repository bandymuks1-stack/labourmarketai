import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { derivePersonalRecord } from "./personal-record";

const m = (month: string, confirmedHours: number, hours = confirmedHours) => ({ month, hours, confirmedHours, entries: 1 });

describe("personal record — the person's own history only", () => {
  it("UNKNOWN when the journal could not be read", () => {
    expect(derivePersonalRecord(null, "2026-10")).toEqual({ kind: "unknown" });
  });

  it("NONE with fewer than two months of confirmed hours (one month is not a record)", () => {
    expect(derivePersonalRecord([], "2026-10")).toEqual({ kind: "none" });
    expect(derivePersonalRecord([m("2026-09", 120), m("2026-08", 0, 50)], "2026-10")).toEqual({ kind: "none" });
  });

  it("the best month of CONFIRMED hours — self-reported hours never set a record", () => {
    const r = derivePersonalRecord([m("2026-07", 100, 200), m("2026-08", 150, 150), m("2026-10", 40, 300)], "2026-10");
    expect(r).toEqual({
      kind: "record",
      best: { month: "2026-08", confirmedHours: 150 },
      current: { month: "2026-10", confirmedHours: 40 },
      isRecordMonth: false,
    });
  });

  it("this month equalling or beating the best is a record month; ties keep the earlier month as the best", () => {
    const r = derivePersonalRecord([m("2026-08", 150), m("2026-10", 150)], "2026-10");
    expect(r).toMatchObject({ best: { month: "2026-08" }, isRecordMonth: true });
  });

  it("a month with nothing confirmed yet is 0 so far, never a record month", () => {
    const r = derivePersonalRecord([m("2026-07", 10), m("2026-08", 20)], "2026-10");
    expect(r).toMatchObject({ current: { confirmedHours: 0 }, isRecordMonth: false });
  });

  it("carries no field that compares the person with anyone else", () => {
    const json = JSON.stringify(derivePersonalRecord([m("2026-07", 10), m("2026-08", 20)], "2026-08")).toLowerCase();
    for (const w of ["rank", "percentile", "average", "others", "team", "score"]) expect(json).not.toContain(w);
  });
});

describe("personal record — stays on the person's own home", () => {
  it("is used ONLY by the home (never the CV, matching, an employer view or the MCP surface)", () => {
    const web = join(__dirname, "..", "..");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const src = readFileSync(full, "utf8");
          if (src.includes("@/lib/home/personal-record") || src.includes('from "./personal-record"')) users.push(relative(web, full).split("\\").join("/"));
        }
      }
    };
    for (const d of ["app", "components", "lib"]) walk(join(web, d));
    expect(users.sort()).toEqual(["components/app/home/home-regions.tsx", "lib/home/home-server.ts"]);
  }, 60_000);
});
