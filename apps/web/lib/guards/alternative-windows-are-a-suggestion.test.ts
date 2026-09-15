import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alternativeWindows,
  MAX_ALTERNATIVE_WINDOWS,
  type GapTimeline,
} from "@/lib/workforce/gap-timeline";

/**
 * "Alternatives are shown" — the DATES half.
 *
 * The crew half was always here: `recommendActions` composes assign /
 * transfer / form-a-brigade / engage-an-agency and the zone renders it. The
 * timeline knew exactly WHEN capacity was short and nothing said when it
 * would not be, so detection reached a warning and stopped.
 *
 * The rule this pins: a window is a SUGGESTION drawn from readings that
 * already exist. It is never a forecast, never stored, and never the
 * least-bad option dressed up as an alternative.
 */
const APP = join(__dirname, "..", "..");
const SRC = readFileSync(join(APP, "lib/workforce/gap-timeline.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

const bucket = (
  start: string,
  end: string,
  riskLevel: "ok" | "tight" | "critical",
  shortfall: number,
) => ({
  bucketStart: start,
  bucketEnd: end,
  entryIds: [],
  requiredHeadcount: 4,
  matchedHeadcount: riskLevel === "ok" ? 4 : 4 - shortfall,
  shortfall,
  missingSkills: [],
  riskLevel,
});

const timeline = (buckets: ReturnType<typeof bucket>[]): GapTimeline => ({
  granularity: "month",
  buckets,
  riskDate: "2026-10-05",
  undatedEntryIds: [],
});

describe("1. only genuinely clear windows are offered", () => {
  it("a tight or critical bucket is never an alternative", () => {
    const t = timeline([
      bucket("2026-11-01", "2026-11-30", "tight", 1),
      bucket("2026-12-01", "2026-12-31", "critical", 3),
    ]);
    expect(alternativeWindows(t, t.riskDate)).toEqual([]);
  });

  it("no clear window yields nothing, not the least-bad one", () => {
    const t = timeline([bucket("2026-11-01", "2026-11-30", "tight", 1)]);
    expect(alternativeWindows(t, t.riskDate)).toHaveLength(0);
  });

  it("a clear bucket after the risk date is offered", () => {
    const t = timeline([
      bucket("2026-11-01", "2026-11-30", "tight", 1),
      bucket("2026-12-01", "2026-12-31", "ok", 0),
    ]);
    const w = alternativeWindows(t, t.riskDate);
    expect(w).toHaveLength(1);
    expect(w[0].bucketStart).toBe("2026-12-01");
  });
});

describe("2. an alternative must come AFTER the problem", () => {
  it("clear buckets at or before the risk date are skipped", () => {
    const t = timeline([
      bucket("2026-09-01", "2026-09-30", "ok", 0),
      bucket("2026-10-01", "2026-10-31", "ok", 0),
      bucket("2026-11-01", "2026-11-30", "ok", 0),
    ]);
    const w = alternativeWindows(t, t.riskDate);
    expect(w.map((x) => x.bucketStart)).toEqual(["2026-11-01"]);
  });

  it("no risk date means no alternative is owed", () => {
    const t = { ...timeline([bucket("2026-11-01", "2026-11-30", "ok", 0)]), riskDate: null };
    expect(alternativeWindows(t, null)).toEqual([]);
  });
});

describe("3. a suggestion, bounded", () => {
  it("never offers more than the cap", () => {
    const t = timeline(
      Array.from({ length: 8 }, (_, i) =>
        bucket(`2026-1${i}-01`, `2026-1${i}-28`, "ok", 0),
      ),
    );
    expect(alternativeWindows(t, "2026-10-05").length).toBeLessThanOrEqual(
      MAX_ALTERNATIVE_WINDOWS,
    );
  });
});

describe("4. it reads; it does not predict or persist", () => {
  it("the function derives nothing beyond filtering existing buckets", () => {
    const fn = code.slice(code.indexOf("export function alternativeWindows"));
    expect(fn).not.toMatch(/forecast|predict|estimate|extrapolat/i);
    expect(fn).not.toMatch(/\.rpc\(|insert|update\(/);
  });

  it("the surface labels it a suggestion and not a forecast", () => {
    const en = JSON.parse(
      readFileSync(join(APP, "messages/en.json"), "utf8"),
    ) as { workforcePlanning: { action: Record<string, string> } };
    const note = en.workforcePlanning.action.altWindowsNote;
    expect(note).toMatch(/suggestion/i);
    expect(note).toMatch(/not a forecast/i);
  });

  it("the page renders nothing when there is no clear window", () => {
    const page = readFileSync(
      join(APP, "app/[locale]/dashboard/company/planning/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/view\.alternativeWindows\.length > 0 \? \(/);
  });
});
