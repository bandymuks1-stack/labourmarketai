import { z } from "zod";

/**
 * THE canonical historical work row — the ONE shape every source becomes.
 *
 * A spreadsheet, a CSV, a PDF table, an ERP export and an authorized agent's
 * structured submission all normalise to this before anything else happens.
 * That is what keeps the feature extensible without a second importer: adding
 * a source means writing a parser that emits `SourceWorkRow[]`, not a new
 * pipeline (ARCHITECTURE §6, the extensibility contract).
 *
 * ── THE RULE THIS TYPE EXISTS TO ENFORCE ───────────────────────────────────
 * `raw` is the source line, verbatim. `factFields` names the canonical fields
 * the source stated EXPLICITLY. Anything the parser worked out — an object
 * inferred from free text, a date reconstructed from a week number, a person
 * guessed from a nickname — belongs in `derived`, with its method and its
 * confidence, and NEVER in `factFields`.
 *
 * A parser that cannot tell the difference must report the field as derived.
 * Under-claiming is always the safe direction; the opposite silently turns a
 * guess into a company's sworn record.
 */

/** Canonical field names a source can state. Used by `factFields` and by the
 *  fact/derived split in `evidence-state.ts`. */
export const SOURCE_ROW_FIELDS = [
  "personLabel",
  "projectLabel",
  "workDate",
  "periodStart",
  "periodEnd",
  "hours",
  "workText",
  "externalRef",
] as const;

export type SourceRowField = (typeof SOURCE_ROW_FIELDS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "not a real calendar date");

const derivedFieldSchema = z.object({
  value: z.union([z.string().max(500), z.number(), z.null()]),
  /** A stable slug the UI localises — never a sentence. */
  method: z.string().min(1).max(60),
  confidence: z.number().min(0).max(1),
  note: z.string().max(300).nullish(),
});

export const sourceWorkRowSchema = z
  .object({
    /** The person as the source names them. Required: a work record with no
     *  person is not history, it is a number. */
    personLabel: z.string().min(1).max(200),
    /** Employee/personnel number as the source carries it. */
    externalRef: z.string().min(1).max(120).nullish(),
    /** The project / object / address as the source writes it. */
    projectLabel: z.string().min(1).max(200).nullish(),
    /** Exactly one of `workDate` or a `periodStart`(+`periodEnd`) is required
     *  — undated work cannot be placed in anyone's history. */
    workDate: isoDate.nullish(),
    periodStart: isoDate.nullish(),
    periodEnd: isoDate.nullish(),
    hours: z.number().min(0).max(9999).nullish(),
    /** What was done, as written. Author content — stored as `original_text`
     *  with the session's `original_language` (doctrine §2.3). */
    workText: z.string().min(1).max(4000),
    /** The source line, verbatim. Never edited by matching or normalisation. */
    raw: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    /** Which canonical fields the SOURCE stated explicitly. */
    factFields: z.array(z.enum(SOURCE_ROW_FIELDS)).default([]),
    /** Every inferred field, with method and confidence. */
    derived: z.record(z.string(), derivedFieldSchema).default({}),
  })
  .strict()
  .refine(
    (r) => Boolean(r.workDate) || Boolean(r.periodStart),
    { message: "a row needs workDate or periodStart", path: ["workDate"] },
  )
  .refine(
    (r) => !r.periodEnd || !r.periodStart || r.periodEnd >= r.periodStart,
    { message: "periodEnd is before periodStart", path: ["periodEnd"] },
  )
  .refine(
    // The load-bearing invariant: a field may not be claimed as a source fact
    // and reported as an inference at the same time.
    (r) => r.factFields.every((f) => !(f in r.derived)),
    { message: "a field cannot be both a source fact and derived", path: ["factFields"] },
  );

export type SourceWorkRow = z.infer<typeof sourceWorkRowSchema>;

/** Bounded batch. Thousands of rows arrive as several of these, never as one
 *  unbounded request — see `import-core.ts` for the resumable submit loop. */
export const MAX_ROWS_PER_SUBMIT = 500;

/** Upper bound on ONE import session, across all its batches. A company with
 *  more history than this splits by year, which is also how it will want to
 *  review it. */
export const MAX_ROWS_PER_SESSION = 20_000;

export const sourceWorkRowBatchSchema = z
  .array(sourceWorkRowSchema)
  .min(1)
  .max(MAX_ROWS_PER_SUBMIT);

/** Trimmed, whitespace-collapsed text — the shape stored and fingerprinted. */
export function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
