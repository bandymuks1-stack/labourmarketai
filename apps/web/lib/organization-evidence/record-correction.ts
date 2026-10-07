import { z } from "zod";

import { canonicalJson, chainHash, fingerprintPayload } from "./fingerprint";
import {
  DATE_RECONSTRUCTED_METHOD,
  dateIsDeclaredReconstructed,
  dateProvenanceColumnIndex,
} from "./parse-tabular";

/**
 * NON-DESTRUCTIVE CORRECTION OF A COMMITTED EVIDENCE RECORD — the pure part.
 *
 * `organization_evidence_records` is INSERT-only (doctrine 3.1). A correction
 * therefore never edits a record: it writes ONE NEW record whose
 * `correction_of` names the record it replaces, and appends a `corrected`
 * event (actor, reason, time, `replacement_record_id`) to the original. The
 * original stays permanent and readable; an EFFECTIVE reading counts only the
 * leaf of the chain, so the same work is never counted twice (A -> B -> C: only
 * C counts).
 *
 * WHAT A CORRECTION MAY CHANGE — deliberately narrow:
 *   · `derivedPatch`: add or replace DERIVED entries (each with method and
 *     confidence). This is the FACT -> DERIVED reclassification: a field the
 *     source never stated is recorded as an inference with its method, and
 *     `committedFactFields` then stops counting it as a source fact. A
 *     derivation can be added or replaced, never removed.
 *   · `overrides`: the few columns a correction may restate — the date or
 *     period, the hours, the object, the place label.
 * What it can NEVER change: the person, the work text, the source line
 * (`source_fact`, verbatim), the source file/row, the session, the supplier.
 *
 * No IO here: the original row and the clock are inputs.
 */

const derivedEntry = z
  .object({
    value: z.union([z.string().max(500), z.number(), z.null()]),
    method: z.string().trim().min(1).max(60),
    confidence: z.number().min(0).max(1),
    note: z.string().max(300).nullish(),
  })
  .strict();

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "not a real calendar date");

export const correctionOverridesSchema = z
  .object({
    activityDate: isoDay.nullable().optional(),
    periodStart: isoDay.nullable().optional(),
    periodEnd: isoDay.nullable().optional(),
    hours: z.number().min(0).max(9999).nullable().optional(),
    workObjectId: z.uuid().nullable().optional(),
    contextLabel: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const correctionInputSchema = z
  .object({
    recordId: z.uuid(),
    /** WHY — stored as the event note, in the actor's own words. */
    reason: z.string().trim().min(3).max(1000),
    derivedPatch: z.record(z.string().min(1).max(60), derivedEntry).optional(),
    overrides: correctionOverridesSchema.optional(),
    /**
     * Re-attest the replacement, as the ACTING organization, when the
     * original's attestation still stands and the correction changed NOTHING
     * but a derived classification. Never automatic, never allowed with a
     * field override: an attestation vouches for content, and changed content
     * is not what was vouched for.
     */
    carryAttestation: z.boolean().optional(),
  })
  .strict();

export type CorrectionInput = z.infer<typeof correctionInputSchema>;

type Row = Readonly<Record<string, unknown>>;

const COPY_COLUMNS = [
  "organization_id",
  "organization_person_id",
  "activity_kind",
  "outcome_kind",
  "context_label",
  "work_object_id",
  "education_program_id",
  "education_cohort_id",
  "activity_date",
  "period_start",
  "period_end",
  "hours",
  "original_text",
  "original_language",
  "evidence_state",
  "supplied_by_organization_id",
  "supplier_role",
  "supplied_by_profile_id",
  "session_id",
  "import_row_id",
  "source_kind",
  "source_filename",
  "source_reference",
  "source_fact",
  "confidence",
  "credential_reference",
  "credential_valid_from",
  "credential_valid_until",
  "project_id",
  "source_row_index",
  "row_origin",
] as const;

const OVERRIDE_COLUMN: Readonly<Record<keyof z.infer<typeof correctionOverridesSchema>, string>> = {
  activityDate: "activity_date",
  periodStart: "period_start",
  periodEnd: "period_end",
  hours: "hours",
  workObjectId: "work_object_id",
  contextLabel: "context_label",
};

export type BuiltCorrection =
  | { readonly ok: false; readonly problems: readonly string[] }
  | {
      readonly ok: true;
      /** The replacement record, ready to insert (no `id`: the DB assigns it). */
      readonly row: Record<string, unknown>;
      readonly fingerprint: string;
      /** Which columns / derived keys this correction touches. */
      readonly changed: { readonly derived: readonly string[]; readonly columns: readonly string[] };
    };

/** The fingerprint of THIS correction of THIS record: same input, same value,
 *  so a repeated correction resolves to the record it already wrote. */
export function correctionFingerprint(originalId: string, input: Pick<CorrectionInput, "derivedPatch" | "overrides">): string {
  return fingerprintPayload(`correction:${originalId}`, {
    derivedPatch: input.derivedPatch ?? {},
    overrides: input.overrides ?? {},
  });
}

export function buildCorrection(
  original: Row,
  input: CorrectionInput,
  ctx: { readonly actorProfileId: string; readonly atIso: string },
): BuiltCorrection {
  const problems: string[] = [];
  const patchKeys = Object.keys(input.derivedPatch ?? {});
  const overrideKeys = Object.entries(input.overrides ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k as keyof typeof OVERRIDE_COLUMN);
  if (patchKeys.length === 0 && overrideKeys.length === 0) problems.push("a correction must change something");

  const originalDerived = ((original.derived as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const derived: Record<string, unknown> = { ...originalDerived, ...(input.derivedPatch ?? {}) };

  const next: Record<string, unknown> = {};
  for (const col of COPY_COLUMNS) next[col] = original[col] ?? null;
  const changedColumns: string[] = [];
  for (const k of overrideKeys) {
    const col = OVERRIDE_COLUMN[k];
    const v = (input.overrides as Record<string, unknown>)[k] ?? null;
    if (next[col] !== v) changedColumns.push(col);
    next[col] = v;
  }

  if (next.activity_date == null && next.period_start == null) problems.push("the record must keep a date or a period start");
  if (next.period_end && next.period_start && String(next.period_end) < String(next.period_start)) {
    problems.push("the period ends before it starts");
  }
  const noEffect =
    changedColumns.length === 0 &&
    patchKeys.every((k) => canonicalJson(originalDerived[k]) === canonicalJson((input.derivedPatch as Record<string, unknown>)[k]));
  if (noEffect && problems.length === 0) problems.push("the correction changes nothing the record does not already say");
  if (problems.length > 0) return { ok: false, problems };

  const fingerprint = correctionFingerprint(String(original.id), input);
  const originalHash = (original.hash_self as string | null) ?? null;
  return {
    ok: true,
    fingerprint,
    changed: { derived: patchKeys, columns: changedColumns },
    row: {
      ...next,
      derived,
      imported_by_profile_id: ctx.actorProfileId,
      imported_at: ctx.atIso,
      record_fingerprint: fingerprint,
      // The chain of a correction runs FROM the record it corrects: the
      // replacement's `hash_prev` is the original's `hash_self`, so a
      // tampered original breaks every link after it (A -> B -> C).
      hash_prev: originalHash,
      hash_self: chainHash(originalHash, fingerprint, ctx.atIso),
      correction_of: String(original.id),
    },
  };
}

/**
 * The reconstructed-date classification for ONE committed record, read from its
 * own verbatim source line — the SAME rule the parser applies to a new file
 * (`dateProvenanceColumnIndex` + `dateIsDeclaredReconstructed`), so a record
 * imported before the rule existed is corrected by re-reading what its source
 * line already said, never by guessing.
 *
 * Returns the `derived.workDate` entry to add, or null when the record needs
 * none (no dated column, the source stated the date, nothing to reclassify, or
 * it is already classified).
 */
export function reconstructedDatePatch(record: {
  readonly activityDate: string | null;
  readonly sourceFact: Record<string, unknown> | null | undefined;
  readonly derived: Record<string, unknown> | null | undefined;
}): Record<string, z.infer<typeof derivedEntry>> | null {
  if (!record.activityDate) return null;
  if ((record.derived ?? {}).workDate !== undefined) return null;
  const source = record.sourceFact && typeof record.sourceFact === "object" ? record.sourceFact : {};
  const keys = Object.keys(source);
  const idx = dateProvenanceColumnIndex(keys);
  if (idx === undefined) return null;
  const cell = String(source[keys[idx]] ?? "").trim();
  if (!dateIsDeclaredReconstructed(cell)) return null;
  return {
    workDate: {
      value: record.activityDate,
      method: DATE_RECONSTRUCTED_METHOD,
      confidence: 0.8,
      note: cell.slice(0, 300),
    },
  };
}
