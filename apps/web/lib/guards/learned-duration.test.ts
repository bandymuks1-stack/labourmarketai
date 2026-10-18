import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CAL-10 — the learning loop closes, and a forecast never becomes a fact.
 *
 * BOTH HALVES ALREADY EXISTED. Every `project_stages` row carries
 * `planned_start`/`planned_end` AND `actual_start`/`actual_end`, so every
 * finished stage has been a measured answer to "how long did this really
 * take, against how long we said" for as long as the table has existed.
 * Nothing read them back. CAL-10 therefore needed no store and no migration —
 * only the reading, and the discipline not to let the reading harden.
 *
 * THAT DISCIPLINE IS WHAT THIS GUARD PINS (SEP-1):
 *   · nothing is written or cached — the reading is derived on every render,
 *     so it cannot outlive the evidence it came from;
 *   · sparse evidence stays sparse — below the threshold there is a COUNT and
 *     no median, because a number beside a planning field is read as guidance
 *     however it is captioned;
 *   · no field anywhere promises a future;
 *   · provenance rides with the number, so it can always be asked where it
 *     came from.
 */

const webRoot = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

const MODEL = "lib/workforce/learned-duration.ts";
const READER = "lib/projects/learned-stage-duration.ts";
const PANEL = "components/app/project-stages-panel.tsx";

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, " ");
}

describe("a forecast is never stored as a fact — SEP-1", () => {
  it("the reading path writes nothing and caches nothing", () => {
    for (const rel of [MODEL, READER]) {
      const c = code(read(rel));
      expect(c, rel).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
      expect(c, rel).not.toMatch(/unstable_cache|revalidateTag|localStorage|new Map\(\)\s*;?\s*\/\/\s*cache/i);
    }
  });

  it("no migration created a learned-duration store", () => {
    // The whole point: this is a reading of rows that already exist. A table
    // would give an estimate the authority of a record, and it would outlive
    // the evidence it came from.
    const migrations = join(webRoot, "..", "..", "supabase", "migrations");
    const offenders = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /learned_duration|duration_estimate|stage_estimate|predicted_duration/i.test(
          readFileSync(join(migrations, f), "utf8"),
        ),
      );
    expect(offenders, "a learned duration must never acquire a table").toEqual([]);
  });

  it("the reader names exactly one relation, and it already exists", () => {
    const froms = [...code(read(READER)).matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(froms).toEqual(["project_stages"]);
  });

  it("no field in the model promises a future", () => {
    const src = read(MODEL);
    expect(code(src)).not.toMatch(/predictedDays|estimateDays|forecastDays|willTake|expectedDays/);
    // What it DOES carry is a statement about the past.
    expect(src).toMatch(/medianActualDays/);
  });
});

describe("sparse evidence stays sparse", () => {
  it("the threshold is enforced in code, not only described", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/export const MIN_OBSERVATIONS = \d+;/);
    expect(c).toMatch(/const enough = confidence !== "insufficient";/);
    expect(c).toMatch(/medianActualDays: enough \?/);
    expect(c).toMatch(/medianPlannedDays: enough \?/);
    expect(c).toMatch(/medianRatio: enough/);
  });

  it("the panel renders nothing at all below the threshold", () => {
    const c = code(read(PANEL));
    expect(c).toMatch(/confidence === "insufficient"[\s\S]{0,80}return null/);
  });

  it("the grouping key does no fuzzy matching", () => {
    // Merging two similarly-named bodies of work would pool their evidence
    // with no way for the reader to see it happened.
    const c = code(read(MODEL));
    expect(c).not.toMatch(/levenshtein|similarity|stem|fuzzy|startsWith\(|includes\(other/i);
    expect(c).toMatch(/normalized\.length >= 2/);
  });

  it("the panel matches a stage to a reading through the SAME key function", () => {
    const c = code(read(PANEL));
    expect(c).toMatch(/durationKey\(name\)/);
    expect(c).toMatch(/readings\.find\(\(r\) => r\.key === key\)/);
  });
});

describe("provenance rides with the number", () => {
  it("every reading carries its count, its span and its rows", () => {
    const src = read(MODEL);
    for (const field of ["observations", "firstObservedOn", "lastObservedOn", "sourceIds"]) {
      expect(src, `LearnedDuration must carry ${field}`).toMatch(new RegExp(`readonly ${field}`));
    }
  });

  it("the rendered line states the count, never a bare number", () => {
    const c = code(read(PANEL));
    expect(c).toMatch(/count: reading\.observations/);
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const learned = JSON.parse(read(`messages/${loc}.json`)).projectStages?.learned;
      expect(learned?.median, `${loc}.projectStages.learned.median`).toBeTruthy();
      expect(learned.median, `${loc} must render the observation count`).toContain("{count}");
      expect(learned.median, `${loc} must render the number of days`).toContain("{days}");
      expect(learned.vsPlan, `${loc}.vsPlan`).toBeTruthy();
      expect(learned.unavailable, `${loc}.unavailable`).toBeTruthy();
    }
  });

  it("the display name is the human spelling, supplied by the caller", () => {
    const c = code(read(MODEL));
    expect(c).toMatch(/displayNameByKey: ReadonlyMap<string, string>/);
    expect(c).toMatch(/displayNameByKey\.get\(key\) \?\? key/);
  });
});

describe("a done stage with no measurement is not a measurement", () => {
  it("the reader skips a stage whose actual dates are missing", () => {
    const c = code(read(READER));
    expect(c).toMatch(/const actualDays = inclusiveDaySpan\(row\.actual_start, row\.actual_end\);/);
    expect(c).toMatch(/if \(actualDays === null\) continue;/);
  });

  it("the reader distinguishes not-applied from unavailable, and neither is empty", () => {
    const src = read(READER);
    expect(src).toMatch(/"not-applied"/);
    expect(src).toMatch(/"unavailable"/);
    // The panel says so rather than rendering silence as "nothing learned".
    expect(code(read(PANEL))).toMatch(/learned\?\.status === "unavailable"/);
  });

  it("authorization is the database's — no service role, no widening filter", () => {
    const c = code(read(READER));
    expect(c).not.toMatch(/service[-_]?role|createAdminClient/i);
    expect(c).toMatch(/\.limit\(STAGE_READ_LIMIT\)/);
  });
});
