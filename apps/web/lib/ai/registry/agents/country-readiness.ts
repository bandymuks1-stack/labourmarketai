/**
 * Country Readiness agent — registry entry (v2, owner decision 2026-10-25).
 *
 * WHAT IT IS NOW. A plain-language READING of the researched country-readiness
 * matrix (lib/country-readiness) for ONE country and ONE scope, in the
 * reader's language. The matrix stays the truth: it is rendered first, in
 * full, with its sources, and it is complete without this agent. The agent
 * adds the one thing the matrix cannot do — read a scope's rows back as a
 * short, ordered explanation ("what this means for you, in what order") —
 * and every step it writes must cite a matrix row by its key.
 *
 * WHAT CHANGED FROM v1. v1 took `role` (free text), `workerDocumentStatus`
 * and `companyHiringModel`: a person's documents and an unbounded description
 * of them, for a function no surface called. v2 admits ONLY the matrix — the
 * country code, the scope, and the rows of that scope (key, level, risk,
 * provenance grade, source title, the statement the reader already sees). No
 * person, no document, no free text a human typed. The strict schema makes
 * that a property of the input, not a promise of the caller.
 *
 * NEVER: a legal guarantee, "fully legal", an unsourced statement (output is
 * INVALID without evidence_refs), a requirement, fee, deadline or authority
 * that is not in the rows, or a change to a row's provenance grade.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

/** The four matrix scopes (mirrors READINESS_SCOPES in lib/country-readiness). */
export const COUNTRY_READING_SCOPES = [
  "worker_solo",
  "worker_posted",
  "team_subcontracting",
  "company_hiring",
] as const;

const sourceRecord = z
  .object({
    /** The matrix row's stable key — what every citation must name. */
    ref: z.string().min(1).max(80),
    level: z.enum(["required", "recommended", "conditional"]),
    risk: z.enum(["high", "medium", "low"]),
    /** Provenance grade of the external source (official | strong |
     *  needs_legal_review) — never a self-assessment. */
    grade: z.enum(["official", "strong", "needs_legal_review"]),
    source: z.string().min(1).max(160),
    /** The localized explanation the reader already sees on the page. */
    statement: z.string().min(1).max(1200),
  })
  .strict();

export const countryReadinessInputSchema = z
  .object({
    country: z.string().regex(/^[A-Z]{2}$/),
    scope: z.enum(COUNTRY_READING_SCOPES),
    sourceRecords: z.array(sourceRecord).min(1).max(40),
  })
  .strict();

export type CountryReadinessInput = z.infer<typeof countryReadinessInputSchema>;

const readingStep = z
  .object({
    /** MUST equal one sourceRecords[].ref — checked by the caller. */
    ref: z.string().min(1).max(80),
    step: z.string().min(1).max(400),
  })
  .strict();

const countryReadinessData = z
  .object({
    summary: z.string().min(1).max(1200),
    steps: z.array(readingStep).min(1).max(20),
    needs_legal_review: z.boolean(),
    /** What this reading cannot tell the reader. Never empty. */
    limitations: z.array(z.string().min(1).max(400)).min(1).max(6),
  })
  .strict();

export const countryReadinessOutputSchema = aiEnvelopeSchema(
  "country_readiness",
  countryReadinessData,
  { requireEvidence: true }, // no unsourced country answer — ever
);

export const countryReadinessEntry: PromptRegistryEntry = {
  agent: "country_readiness",
  version: "2.0.0",
  title: "Country Readiness Reading",
  system: [
    "You read a researched country-readiness matrix for ONE country and ONE",
    "scope back to the reader in plain language: a short summary, then the",
    "steps that matter, most important first. Use ONLY the provided source",
    "records. Every step MUST cite exactly one record by its `ref`, and",
    "evidence_refs MUST cite refs from the records — never general knowledge,",
    "never unsourced web text. Never invent a requirement, fee, deadline,",
    "authority or form that is not in the records. A record graded",
    "needs_legal_review is a question to confirm with the national authority,",
    "not an answer: say so and set needs_legal_review to true. You never write",
    "a legal guarantee, never say 'fully legal' or 'guaranteed to work', and",
    "never change a record's grade. This is not legal advice; limitations must",
    "say what the reading cannot tell the reader. Return ONLY the JSON envelope",
    "with non-empty evidence_refs.",
  ].join(" "),
  inputSchema: countryReadinessInputSchema,
  outputSchema: countryReadinessOutputSchema,
  safetyRules: [
    "Never answer without at least one evidence_ref citing a source record.",
    "Every step cites one source record by ref; an invented ref voids the reading.",
    "Never produce a legal guarantee or 'fully legal' statement.",
    "Never change or assert an official requirement status or grade.",
    "A needs_legal_review record is flagged, never presented as settled.",
  ],
  allowedEvidenceSources: ["country_readiness_matrix"],
  blockedClaims: ["fully legal", "legal guarantee", "guaranteed", "verified"],
  lastUpdated: "2026-10-25",
};
