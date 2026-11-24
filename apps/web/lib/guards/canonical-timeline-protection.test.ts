import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
 *  3. DEAD FABRICATED FEED IS GONE (Dead Surface Code Removal v1,
 *     owner-approved OD-6) — the MicroActivityFeed component file no
 *     longer exists, nothing references its symbol, and the fabricated
 *     activity.feed.* placeholder pool it exclusively owned is deleted.
 *     This ABSENCE contract replaces the former containment pin so no
 *     fake live-activity ticker can quietly return.
 *  4. Canonical surfaces stay canonical — /dashboard/activity remains the
 *     one cross-module attention surface (spine-driven), and the calendar
 *     remains /dashboard/planning.
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

  it("only the planning page, the planning model and the TWO presentation adapters touch the calendar builders", () => {
    // Time Engine W3 (real-user workflow rebuild): the conversation may
    // SUMMARISE the canonical projection (`lib/conversation/agenda-summary.ts`
    // — text lines over buildAgenda, delegating to getPlanning) so the chat
    // can answer "what is my plan?" with real data. The W3 calendar slice
    // added the SECOND presentation of the same projection
    // (`lib/planning/calendar-result.ts` — the Context Panel's bounded
    // re-shaping, same delegation, its own guard in
    // w3-calendar-result.test.ts pins that it reads nothing else). Both
    // render NO calendar view of their own and read NO table of their own —
    // the one-calendar rule stands: any NEW consumer beyond these four still
    // fails this guard.
    const consumers = allSourceFiles()
      .filter((p) => BUILDERS.test(readFileSync(p, "utf8")))
      .map(rel)
      .sort();
    expect(consumers).toEqual([
      "app/[locale]/dashboard/planning/page.tsx",
      "lib/conversation/agenda-summary.ts",
      "lib/planning/calendar-result.ts",
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

describe("fabricated activity feed is ABSENT (Dead Surface Code Removal v1)", () => {
  it("the MicroActivityFeed file no longer exists", () => {
    expect(
      existsSync(join(ROOT, "components", "app", "micro-activity-feed.tsx")),
    ).toBe(false);
  });

  it("no source references the removed symbol or its kebab-case name", () => {
    const refs = allSourceFiles()
      .filter((p) => /micro-activity-feed|MicroActivityFeed/.test(readFileSync(p, "utf8")))
      .map(rel);
    expect(refs).toEqual([]);
  });

  it("the fabricated activity.feed.* placeholder pool is gone from ALL source (incl. placeholders.ts)", () => {
    const refs = allSourceFiles()
      .filter((p) => readFileSync(p, "utf8").includes("activity.feed."))
      .map(rel);
    expect(refs).toEqual([]);
  });

  it("the exclusively-owned live.activity i18n key is gone from every locale file", () => {
    const files = walk(join(ROOT, "messages"), (p) => p.endsWith(".json"));
    for (const p of files) {
      const msgs = JSON.parse(readFileSync(p, "utf8"));
      expect(msgs?.live?.activity, rel(p)).toBeUndefined();
    }
  });

  it("canonical activity surface survives untouched (spine-driven, no fake feed replacement)", () => {
    const activityPage = join(
      ROOT,
      "app",
      "[locale]",
      "dashboard",
      "activity",
      "page.tsx",
    );
    expect(existsSync(activityPage)).toBe(true);
    expect(readFileSync(activityPage, "utf8")).toMatch(/buildActivityRows|activity-centre/);
  });
});
