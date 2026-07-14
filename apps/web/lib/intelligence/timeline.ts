/**
 * Intelligence TIMELINE (Trust Layer v1).
 *
 * Every future insight must be able to show its full derivation as an
 * auditable timeline:
 *
 *   source → observation → validation → aggregation → insight → visible
 *
 * Each stage carries a timestamp, an actor, a provenance reference and an
 * explanation — all four are REQUIRED, because a stage that cannot say who
 * did what, when, on which record, is not auditable. Builders REFUSE
 * (result type, stable reason codes) instead of silently accepting a
 * malformed timeline.
 *
 * i18n: actorCode / explanationCode are stable i18n codes — never display
 * strings. Pure module: no IO, no Date.now.
 */

export const TIMELINE_STAGE_KINDS = [
  "source",
  "observation",
  "validation",
  "aggregation",
  "insight",
  "visible",
] as const;
export type TimelineStageKind = (typeof TIMELINE_STAGE_KINDS)[number];

export interface TimelineStageV1 {
  readonly stage: TimelineStageKind;
  /** ISO timestamp of when this stage happened. */
  readonly timestampIso: string;
  /** i18n code naming the actor (`intelligence.timeline.actor.*`). */
  readonly actorCode: string;
  /** Traceable reference: observation id, content hash, source key, … */
  readonly provenanceRef: string;
  /** i18n code explaining what happened at this stage. */
  readonly explanationCode: string;
}

export interface IntelligenceTimelineV1 {
  readonly stages: readonly TimelineStageV1[];
  readonly firstTimestampIso: string;
  readonly lastTimestampIso: string;
}

export type TimelineBuildReasonCode =
  | "empty_timeline"
  | "unknown_stage"
  | "stage_out_of_order"
  | "duplicate_stage"
  | "invalid_timestamp"
  | "timestamp_regression"
  | "missing_field";

export type TimelineBuildResult =
  | { readonly ok: true; readonly timeline: IntelligenceTimelineV1 }
  | { readonly ok: false; readonly reasonCode: TimelineBuildReasonCode };

const STAGE_INDEX: ReadonlyMap<string, number> = new Map(
  TIMELINE_STAGE_KINDS.map((kind, index) => [kind, index]),
);

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validate + freeze a timeline. Stages must be a non-empty ordered subset
 * of the canonical flow (each stage at most once, canonical order), every
 * timestamp must parse, and time must never run backwards between stages.
 */
export function buildTimeline(
  stages: readonly TimelineStageV1[],
): TimelineBuildResult {
  if (!Array.isArray(stages) || stages.length === 0) {
    return { ok: false, reasonCode: "empty_timeline" };
  }
  let previousStageIndex = -1;
  let previousMs = Number.NEGATIVE_INFINITY;
  for (const stage of stages) {
    if (
      !isNonEmpty(stage.actorCode) ||
      !isNonEmpty(stage.provenanceRef) ||
      !isNonEmpty(stage.explanationCode) ||
      !isNonEmpty(stage.timestampIso)
    ) {
      return { ok: false, reasonCode: "missing_field" };
    }
    const stageIndex = STAGE_INDEX.get(stage.stage);
    if (stageIndex === undefined) {
      return { ok: false, reasonCode: "unknown_stage" };
    }
    if (stageIndex === previousStageIndex) {
      return { ok: false, reasonCode: "duplicate_stage" };
    }
    if (stageIndex < previousStageIndex) {
      return { ok: false, reasonCode: "stage_out_of_order" };
    }
    const ms = Date.parse(stage.timestampIso);
    if (!Number.isFinite(ms)) {
      return { ok: false, reasonCode: "invalid_timestamp" };
    }
    if (ms < previousMs) {
      return { ok: false, reasonCode: "timestamp_regression" };
    }
    previousStageIndex = stageIndex;
    previousMs = ms;
  }
  return {
    ok: true,
    timeline: {
      stages: [...stages],
      firstTimestampIso: stages[0].timestampIso,
      lastTimestampIso: stages[stages.length - 1].timestampIso,
    },
  };
}

/** Stable i18n code for a stage name (`intelligence.timeline.stage.*`). */
export function timelineStageLabelCode(stage: TimelineStageKind): string {
  return `intelligence.timeline.stage.${stage}`;
}
