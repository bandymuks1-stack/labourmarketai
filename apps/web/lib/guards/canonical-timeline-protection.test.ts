import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Canonical timeline protection guard (Surface Reality Audit v1,
 * owner correction 2026-07-17 — "KANONINIO TIMELINE APSAUGA").
 *
 * /dashboard/planning is the ONE canonical time surface. This guard is
 * AUDIT EVIDENCE, not a behavior change: it freezes the facts the audit
 * proved so no later slice can drift them silently:
 *
 *  1. NO SECOND CALENDAR — the calendar view builders (buildAgenda /
 *     buildMonthGrid / buildWeekView / buildYearOverview) are consumed by
 *     exactly ONE page: the planning page. Other modules may reuse the pure
 *     date helpers, never the calendar projection itself.
 *  2. NO PARALLEL TIMELINE ROUTE — no dashboard route directory named
 *     "calendar" or "timeline" exists; the planning route is the only
 *     calendar-shaped surface.
 *  3. DEAD FABRICATED FEED STAYS CONTAINED — MicroActivityFeed (a
 *     placeholder-fed "live activity" ticker) is imported by NOTHING, so
 *     its fabricated activity.feed.* rows cannot reach any production
 *     surface. Its removal is a separate owner-sequenced PR (Dead Surface
 *     Code Removal v1); until then this pin proves containment.
 *  4. The fabricated activity.feed.* placeholder pool has no OTHER
 *     consumer either — nothing new may start streaming fake activity.
 *
 * planning.test.ts already pins the source-type registry, the projection
 * (read-only) contract and the view math; this guard only adds the
 * exclusivity + containment facts from the audit.
 */

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo")
        continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) {
      out.push(p);
    }
  }
  return out;
}

const isSource = (p: string): boolean =>
  (p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".test.ts");

/** Every non-guard source file of the three code roots. */
function allSourceFiles(): string[] {
  return ["app", "components", "lib"].flatMap((d) =>
    walk(join(ROOT, d), isSource),
  );
}

const rel = (p: string): string => relative(ROOT, p).replaceAll("\\", "/");

describe("one canonical calendar — the view builders have exactly one consumer", () => {
  const BUILDERS = /build(Agenda|MonthGrid|WeekView|YearOverview)/;

  it("only the planning page and the planning model itself touch the calendar builders", () => {
    const consumers = allSourceFiles()
      .filter((p) => BUILDERS.test(readFileSync(p, "utf8")))
      .map(rel)
      .sort();
    expect(consumers).toEqual([
      "app/[locale]/dashboard/planning/page.tsx",
      "lib/planning/planning-model.ts",
    ]);
  });

  it("no dashboard route directory is named calendar or timeline", () => {
    const dashboardDir = join(ROOT, "app", "[locale]", "dashboard");
    const routeDirs: string[] = [];
    const collect = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          routeDirs.push(entry.toLowerCase());
          collect(p);
        }
      }
    };
    collect(dashboardDir);
    expect(routeDirs).not.toContain("calendar");
    expect(routeDirs).not.toContain("timeline");
  });
});

describe("fabricated activity feed stays contained until its removal PR", () => {
  it("MicroActivityFeed is imported by nothing (dead, therefore unreachable)", () => {
    const importers = allSourceFiles()
      .filter((p) => !p.endsWith("micro-activity-feed.tsx"))
      .filter((p) => /micro-activity-feed|MicroActivityFeed/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(importers).toEqual([]);
  });

  it("no other component consumes the fabricated activity.feed.* placeholder pool", () => {
    const consumers = allSourceFiles()
      .filter((p) => !p.endsWith("micro-activity-feed.tsx"))
      .filter((p) => !p.endsWith(join("content", "placeholders.ts")))
      .filter((p) => readFileSync(p, "utf8").includes("activity.feed."))
      .map(rel);
    expect(consumers).toEqual([]);
  });
});
