/**
 * Work Journal Structuring agent — registry entry (Internal LLM Agents v1, PR5).
 *
 * Helps extract STRUCTURE from a worker's freeform journal text. NEVER asserts
 * the work was done well/correctly (no confirmation exists), NEVER derives facts
 * from photos (no OCR/image pipeline), NEVER creates invoice facts. Output is a
 * draft the worker/manager confirms.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const workJournalInputSchema = z
  .object({
    rawText: z.string().min(1).max(8000),
    date: z.string().max(40).optional(),
    projectContext: z.string().max(400).optional(),
    workerRole: z.string().max(160).optional(),
    /** Photo METADATA only (filename/time) — never image contents. */
    photosMetadata: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

const workJournalData = z
  .object({
    tasks_performed: z.array(z.string().min(1).max(300)).max(40),
    tools_materials: z.array(z.string().min(1).max(160)).max(40),
    possible_skills: z.array(z.string().min(1).max(120)).max(30),
    safety_notes: z.array(z.string().min(1).max(300)).max(20),
    evidence_summary: z.string().max(2000).nullable(),
    unclear_points: z.array(z.string().min(1).max(300)).max(20),
    suggested_followup_question: z.string().max(300).nullable(),
    // ── v1.1 (Journal Proof Engine) — OPTIONAL structured CANDIDATES ────────
    // Additive: outputs without these fields still validate (v1.0 stays
    // valid). Everything below is a suggestion the WORKER must confirm
    // per-item; nothing is persisted by the agent, nothing may be invented —
    // only restated from the worker's own entry text.
    suggested_achievements: z
      .array(
        z
          .object({
            title: z.string().min(3).max(160),
            year: z.number().int().min(1900).max(2100).nullable(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    suggested_experience_periods: z
      .array(
        z
          .object({
            title: z.string().min(3).max(200),
            start_year: z.number().int().min(1900).max(2100).nullable(),
            end_year: z.number().int().min(1900).max(2100).nullable(),
            is_current: z.boolean(),
          })
          .strict(),
      )
      .max(5)
      .optional(),
    /** Project / site NAMES the entry text itself mentions — matched
     *  client-side against the worker's OWN engagement contexts; never an
     *  invented project, never an id. */
    suggested_project_names: z
      .array(z.string().min(2).max(160))
      .max(5)
      .optional(),
  })
  .strict();

export const workJournalOutputSchema = aiEnvelopeSchema("work_journal", workJournalData);

export const workJournalEntry: PromptRegistryEntry = {
  agent: "work_journal",
  version: "1.1.0",
  title: "Work Journal Structuring Agent",
  system: [
    "You extract structure from a worker's OWN freeform journal text: tasks,",
    "tools/materials, possible skills, safety notes, an evidence summary, unclear",
    "points, and ONE follow-up question. You never claim the work was done well or",
    "correctly — no confirmation exists. You never derive facts from photos (there",
    "is no image/OCR pipeline; photo metadata is context only). You never create",
    "invoice or payment facts. 'Possible skills' are candidates for the Skill",
    "Evidence agent, not confirmed skills. When the text PLAINLY states them you",
    "MAY additionally return structured candidates: suggested_achievements (a",
    "completed, named result the worker described), suggested_experience_periods",
    "(an employer/role period the worker named, with null for unstated years) and",
    "suggested_project_names (project/site names the text itself mentions —",
    "restated exactly, never invented). Every candidate is a draft the worker",
    "must confirm; omit the fields when the text states nothing structured.",
    "Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: workJournalInputSchema,
  outputSchema: workJournalOutputSchema,
  safetyRules: [
    "Never assert the work was done well/correctly — no confirmation exists.",
    "Never derive facts from photos; photo metadata is context only.",
    "Never create invoice/payment facts.",
    "Possible skills are candidates, never confirmed; nothing is persisted.",
    "v1.1 structured candidates (achievements/experience/projects) are drafts the worker confirms per-item; never invented, only restated from the text.",
  ],
  allowedEvidenceSources: ["journal_entries", "journal_entry_photos_metadata"],
  blockedClaims: ["done well", "verified", "invoice", "confirmed"],
  lastUpdated: "2026-07-14",
};
