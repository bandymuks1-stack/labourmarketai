import { describe, it, expect } from "vitest";

import {
  buildTimeline,
  TIMELINE_STAGE_KINDS,
  timelineStageLabelCode,
  type TimelineStageV1,
} from "./timeline";

function stage(
  kind: TimelineStageV1["stage"],
  timestampIso: string,
  overrides: Partial<TimelineStageV1> = {},
): TimelineStageV1 {
  return {
    stage: kind,
    timestampIso,
    actorCode: "intelligence.timeline.actor.system",
    provenanceRef: "obs-hash-abc123",
    explanationCode: "intelligence.timeline.stage.observation",
    ...overrides,
  };
}

const FULL_FLOW: TimelineStageV1[] = [
  stage("source", "2026-07-01T08:00:00Z"),
  stage("observation", "2026-07-01T08:05:00Z"),
  stage("validation", "2026-07-01T08:06:00Z"),
  stage("aggregation", "2026-07-01T09:00:00Z"),
  stage("insight", "2026-07-01T09:01:00Z"),
  stage("visible", "2026-07-01T09:02:00Z"),
];

describe("buildTimeline — canonical source→…→visible flow", () => {
  it("accepts the full canonical flow and freezes first/last timestamps", () => {
    const result = buildTimeline(FULL_FLOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timeline.stages).toHaveLength(6);
    expect(result.timeline.firstTimestampIso).toBe("2026-07-01T08:00:00Z");
    expect(result.timeline.lastTimestampIso).toBe("2026-07-01T09:02:00Z");
  });

  it("accepts an ordered subset (not every stage must exist yet)", () => {
    const result = buildTimeline([
      stage("observation", "2026-07-01T08:00:00Z"),
      stage("insight", "2026-07-01T09:00:00Z"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("refuses an empty timeline", () => {
    const result = buildTimeline([]);
    expect(result).toEqual({ ok: false, reasonCode: "empty_timeline" });
  });

  it("refuses out-of-order and duplicate stages", () => {
    expect(
      buildTimeline([
        stage("insight", "2026-07-01T08:00:00Z"),
        stage("observation", "2026-07-01T09:00:00Z"),
      ]),
    ).toEqual({ ok: false, reasonCode: "stage_out_of_order" });
    expect(
      buildTimeline([
        stage("observation", "2026-07-01T08:00:00Z"),
        stage("observation", "2026-07-01T09:00:00Z"),
      ]),
    ).toEqual({ ok: false, reasonCode: "duplicate_stage" });
  });

  it("refuses time running backwards between stages", () => {
    expect(
      buildTimeline([
        stage("observation", "2026-07-01T09:00:00Z"),
        stage("insight", "2026-07-01T08:00:00Z"),
      ]),
    ).toEqual({ ok: false, reasonCode: "timestamp_regression" });
  });

  it("refuses unparsable timestamps and missing audit fields", () => {
    expect(buildTimeline([stage("source", "not-a-date")])).toEqual({
      ok: false,
      reasonCode: "invalid_timestamp",
    });
    expect(
      buildTimeline([
        stage("source", "2026-07-01T08:00:00Z", { actorCode: " " }),
      ]),
    ).toEqual({ ok: false, reasonCode: "missing_field" });
    expect(
      buildTimeline([
        stage("source", "2026-07-01T08:00:00Z", { provenanceRef: "" }),
      ]),
    ).toEqual({ ok: false, reasonCode: "missing_field" });
    expect(
      buildTimeline([
        stage("source", "2026-07-01T08:00:00Z", { explanationCode: "" }),
      ]),
    ).toEqual({ ok: false, reasonCode: "missing_field" });
  });

  it("refuses an unknown stage kind", () => {
    expect(
      buildTimeline([
        stage("hallucination" as TimelineStageV1["stage"], "2026-07-01T08:00:00Z"),
      ]),
    ).toEqual({ ok: false, reasonCode: "unknown_stage" });
  });
});

describe("timeline stage labels", () => {
  it("every canonical stage has a stable i18n code", () => {
    for (const kind of TIMELINE_STAGE_KINDS) {
      expect(timelineStageLabelCode(kind)).toBe(
        `intelligence.timeline.stage.${kind}`,
      );
    }
  });
});
