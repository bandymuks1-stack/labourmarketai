/**
 * COUNTRY READINESS READING — the pure half (owner decision 2026-10-25,
 * registry row 10.11: integrate `country_readiness`, do not build a second
 * answer system).
 *
 * The matrix in this directory IS the answer. It is rendered first, in full,
 * with a source and a review date on every row, and it is complete without
 * anything in this file. What a model can add — and the matrix cannot — is a
 * reading: one scope's rows explained back in plain language, in the order
 * that matters, as a suggestion. This module holds the two deterministic
 * walls around that reading:
 *
 *   1. WHAT LEAVES (`buildCountryReadingPayload`). Only matrix rows: key,
 *      level, risk, provenance grade, source title and the statement the
 *      reader already sees. Never a person, a document, a user id or text a
 *      human typed. A country without researched content produces NO payload
 *      — the honest absence the page already shows, never a neighbour's rows.
 *
 *   2. WHAT IS SHOWN (`acceptCountryReading`). Every step and every evidence
 *      ref must name a row that was actually sent. One invented ref voids the
 *      whole reading: a paragraph that cites a requirement the matrix does not
 *      hold is exactly the unsourced country answer doctrine §7 forbids, and
 *      showing "most of it" would hide which part was made up. The source a
 *      step displays is resolved FROM THE MATRIX, never from model text, and
 *      the "needs a legal check" flag is the matrix's own (the model may add
 *      it, never remove it).
 *
 * Pure. No IO, no env, no AI import — the server action owns the call.
 */
import type {
  ReadinessConfidence,
  ReadinessRequirement,
  ReadinessScope,
} from "./types";
import { getCountryReadinessOrNull } from "./index";

/** One matrix row as it travels. Field names are the agent's input schema. */
export interface CountryReadingRecord {
  readonly ref: string;
  readonly level: ReadinessRequirement["level"];
  readonly risk: ReadinessRequirement["riskLevel"];
  readonly grade: ReadinessConfidence;
  readonly source: string;
  readonly statement: string;
}

export interface CountryReadingPayload {
  readonly country: string;
  readonly scope: ReadinessScope;
  readonly sourceRecords: readonly CountryReadingRecord[];
}

/**
 * The rows of one scope, as the agent receives them. `explain` returns the
 * localized statement for an explanation key — the same text the page shows.
 * Null when the country has no researched content or the scope has no rows.
 */
export function buildCountryReadingPayload(
  country: string,
  scope: ReadinessScope,
  explain: (explanationKey: string) => string,
): CountryReadingPayload | null {
  const readiness = getCountryReadinessOrNull(country.toUpperCase());
  if (!readiness) return null;
  const seen = new Set<string>();
  const sourceRecords: CountryReadingRecord[] = [];
  for (const r of readiness.requirements) {
    if (r.scope !== scope || seen.has(r.key)) continue;
    seen.add(r.key);
    sourceRecords.push({
      ref: r.key,
      level: r.level,
      risk: r.riskLevel,
      grade: r.confidence,
      source: r.sourceTitle,
      statement: explain(r.explanationKey),
    });
  }
  if (sourceRecords.length === 0) return null;
  return { country: readiness.country, scope, sourceRecords };
}

/** A step as the surface renders it: model text + matrix-resolved source. */
export interface CountryReadingStep {
  readonly ref: string;
  readonly text: string;
  readonly sourceTitle: string;
  readonly sourceUrl: string;
  /** The MATRIX's grade for this row, not the model's opinion of it. */
  readonly needsLegalCheck: boolean;
}

export interface CountryReading {
  readonly summary: string;
  readonly steps: readonly CountryReadingStep[];
  /** True when the model says so OR any row sent is graded needs_legal_review. */
  readonly needsLegalCheck: boolean;
  readonly limitations: readonly string[];
}

export type CountryReadingVerdict =
  | { readonly ok: true; readonly reading: CountryReading }
  | { readonly ok: false; readonly reason: "unsourced" | "malformed" };

interface ReadingEnvelope {
  readonly evidence_refs?: readonly { readonly ref?: unknown }[];
  readonly data?: {
    readonly summary?: unknown;
    readonly steps?: readonly { readonly ref?: unknown; readonly step?: unknown }[];
    readonly needs_legal_review?: unknown;
    readonly limitations?: readonly unknown[];
  };
}

/**
 * Accept a schema-valid envelope only if every citation names a row that was
 * sent. The run-core has already validated the SHAPE against the agent's
 * strict output schema; this checks the one thing a schema cannot — that the
 * refs are the refs of THIS payload.
 */
export function acceptCountryReading(
  envelope: unknown,
  payload: CountryReadingPayload,
): CountryReadingVerdict {
  const env = (envelope ?? {}) as ReadingEnvelope;
  const data = env.data;
  if (
    !data ||
    typeof data.summary !== "string" ||
    data.summary.trim() === "" ||
    !Array.isArray(data.steps) ||
    data.steps.length === 0 ||
    !Array.isArray(data.limitations) ||
    data.limitations.length === 0
  ) {
    return { ok: false, reason: "malformed" };
  }

  const readiness = getCountryReadinessOrNull(payload.country);
  if (!readiness) return { ok: false, reason: "unsourced" };
  const rows = new Map<string, ReadinessRequirement>();
  for (const r of readiness.requirements) {
    if (r.scope === payload.scope && !rows.has(r.key)) rows.set(r.key, r);
  }
  const sent = new Set(payload.sourceRecords.map((s) => s.ref));
  const known = (ref: unknown): ref is string =>
    typeof ref === "string" && sent.has(ref) && rows.has(ref);

  const refs = Array.isArray(env.evidence_refs) ? env.evidence_refs : [];
  if (refs.length === 0 || !refs.every((e) => known(e?.ref))) {
    return { ok: false, reason: "unsourced" };
  }

  const steps: CountryReadingStep[] = [];
  for (const s of data.steps) {
    if (!known(s?.ref) || typeof s.step !== "string" || s.step.trim() === "") {
      return { ok: false, reason: "unsourced" };
    }
    const row = rows.get(s.ref)!;
    steps.push({
      ref: s.ref,
      text: s.step,
      sourceTitle: row.sourceTitle,
      sourceUrl: row.sourceUrl,
      needsLegalCheck: row.confidence === "needs_legal_review",
    });
  }

  const matrixSaysCheck = payload.sourceRecords.some(
    (s) => s.grade === "needs_legal_review",
  );
  return {
    ok: true,
    reading: {
      summary: data.summary,
      steps,
      needsLegalCheck: matrixSaysCheck || data.needs_legal_review === true,
      limitations: data.limitations.filter(
        (l): l is string => typeof l === "string" && l.trim() !== "",
      ),
    },
  };
}
