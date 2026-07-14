/**
 * Insight EXPLAINABILITY contract — every displayed intelligence insight
 * must carry an InsightExplanationV1: what the number means, what data it
 * rests on, over which window/geography, on what sample, from what origin,
 * and with which honest uncertainties.
 *
 * All *Code / *Codes fields are stable i18n codes — the UI localizes them;
 * this layer never emits display strings. Pure module: no IO.
 */

export type InsightOriginKind = "external" | "internal" | "blended";

export interface InsightExplanationV1 {
  /** i18n code answering "what does this insight mean". */
  readonly meaningCode: string;
  /** i18n codes naming the data the insight rests on (≥1, all non-empty). */
  readonly dataBasisCodes: readonly string[];
  readonly window: {
    readonly start: string | null;
    readonly end: string | null;
  };
  /** Human-scoped geography label (e.g. "LT" / "LT · Vilnius") or null. */
  readonly geoLabel: string | null;
  /** Honest sample size, or null when the source carries none. */
  readonly sampleSize: number | null;
  readonly originKind: InsightOriginKind;
  /** i18n code for the suggested next action, or null. */
  readonly nextActionCode: string | null;
  /** i18n codes for honest uncertainties (small sample, no basis info…). */
  readonly uncertaintyCodes: readonly string[];
}

const ORIGIN_KINDS: ReadonlySet<string> = new Set([
  "external",
  "internal",
  "blended",
]);

function isNonEmptyCode(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Build (and validate) an explanation. Throws on any structurally invalid
 * input — an insight without a complete explanation must never render, so
 * failing loudly at build time is the honest behaviour.
 */
export function buildExplanation(input: {
  meaningCode: string;
  dataBasisCodes: readonly string[];
  window?: { start: string | null; end: string | null };
  geoLabel?: string | null;
  sampleSize?: number | null;
  originKind: InsightOriginKind;
  nextActionCode?: string | null;
  uncertaintyCodes?: readonly string[];
}): InsightExplanationV1 {
  if (!isNonEmptyCode(input.meaningCode)) {
    throw new Error("InsightExplanationV1: meaningCode must be non-empty");
  }
  if (
    !Array.isArray(input.dataBasisCodes) ||
    input.dataBasisCodes.length === 0 ||
    !input.dataBasisCodes.every(isNonEmptyCode)
  ) {
    throw new Error(
      "InsightExplanationV1: dataBasisCodes must be a non-empty list of non-empty codes",
    );
  }
  if (!ORIGIN_KINDS.has(input.originKind)) {
    throw new Error(
      `InsightExplanationV1: invalid originKind "${String(input.originKind)}"`,
    );
  }
  const uncertaintyCodes = input.uncertaintyCodes ?? [];
  if (!uncertaintyCodes.every(isNonEmptyCode)) {
    throw new Error(
      "InsightExplanationV1: uncertaintyCodes must all be non-empty",
    );
  }
  if (
    input.nextActionCode !== undefined &&
    input.nextActionCode !== null &&
    !isNonEmptyCode(input.nextActionCode)
  ) {
    throw new Error(
      "InsightExplanationV1: nextActionCode must be null or non-empty",
    );
  }
  const sampleSize = input.sampleSize ?? null;
  if (
    sampleSize !== null &&
    (!Number.isInteger(sampleSize) || sampleSize < 0)
  ) {
    throw new Error(
      "InsightExplanationV1: sampleSize must be null or a non-negative integer",
    );
  }
  return {
    meaningCode: input.meaningCode,
    dataBasisCodes: [...input.dataBasisCodes],
    window: {
      start: input.window?.start ?? null,
      end: input.window?.end ?? null,
    },
    geoLabel: input.geoLabel ?? null,
    sampleSize,
    originKind: input.originKind,
    nextActionCode: input.nextActionCode ?? null,
    uncertaintyCodes: [...uncertaintyCodes],
  };
}
