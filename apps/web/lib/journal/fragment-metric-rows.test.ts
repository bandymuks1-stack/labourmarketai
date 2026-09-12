import { describe, expect, it } from "vitest";
import { fragmentMetricRows } from "./journal-write-core";

/**
 * ONE fragment-row builder for both writers (#1689, measured on production
 * 2026-09-12: the supersede writer's own copy hardcoded `worker_input`).
 */
describe("fragmentMetricRows — every row of a fragment carries the fragment's own provenance", () => {
  it("ai_extracted stays ai_extracted on phrase, time and activity rows; a clarification is always the worker's word", () => {
    const rows = fragmentMetricRows([
      {
        rawPhrase: "2 val. testavau",
        timeValue: 2,
        timeUnit: "hours",
        activitySlug: null,
        activityLabel: "testavimas",
        isUnknown: true,
        userLabel: "programų testavimas",
        selected: false,
        source: "ai_extracted",
      },
    ]);
    expect(rows.map((r) => [r.metric_slug, r.source])).toEqual([
      ["parsed_fragment", "ai_extracted"],
      ["fragment_time", "ai_extracted"],
      ["fragment_activity", "ai_extracted"],
      ["unknown_phrase", "worker_input"],
    ]);
    expect(rows[0].value_text).toBe("1|2 val. testavau");
    expect(rows[1]).toMatchObject({ value_numeric: 2, unit_slug: "hours", value_text: "1" });
  });

  it("no provenance → the worker's input (the default both writers always had)", () => {
    const rows = fragmentMetricRows([
      {
        rawPhrase: "5 val. programavau",
        timeValue: 5,
        timeUnit: "hours",
        activitySlug: "programming",
        activityLabel: null,
        isUnknown: false,
        userLabel: null,
        selected: true,
      },
    ]);
    expect(rows.every((r) => r.source === "worker_input")).toBe(true);
    expect(rows.map((r) => r.metric_slug)).toEqual(["parsed_fragment", "fragment_time", "fragment_activity"]);
  });

  it("index pairing survives across fragments (1-based, in order)", () => {
    const rows = fragmentMetricRows([
      { rawPhrase: "a", timeValue: 1, timeUnit: "hours", activitySlug: null, activityLabel: null, isUnknown: false, userLabel: null, selected: false, source: "ai_extracted" },
      { rawPhrase: "b", timeValue: null, timeUnit: null, activitySlug: null, activityLabel: null, isUnknown: false, userLabel: null, selected: false, source: "worker_input" },
    ]);
    expect(rows.map((r) => [r.metric_slug, r.value_text, r.source])).toEqual([
      ["parsed_fragment", "1|a", "ai_extracted"],
      ["fragment_time", "1", "ai_extracted"],
      ["parsed_fragment", "2|b", "worker_input"],
    ]);
  });
});
