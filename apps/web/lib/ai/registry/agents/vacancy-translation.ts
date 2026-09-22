/**
 * Vacancy Translation agent — registry entry.
 *
 * THE SECOND AGENT WHOSE PAYLOAD CARRIES NO DATA SUBJECT OF THIS PLATFORM.
 *
 * Its input is the verbatim TITLE (and, on request, the DESCRIPTION) of job
 * advertisements that a public employment service already published to the
 * whole internet under an open-data licence (Arbetsförmedlingen / JobTech —
 * the row's `attribution_code` names the source). LabourMarket.ai is not the
 * controller of that text; it mirrors it with attribution. Sending the same
 * public text to a translation provider discloses nothing that is not
 * already public. What the payload deliberately EXCLUDES is pinned by the
 * task policy (`translate_vacancy` in task-routing.ts): no employer name, no
 * application URL, no employer id, no coordinates, no LabourMarket person,
 * no matching data. The classification (`PUBLIC`) is therefore a statement
 * about the fields, checkable in `ai-wired-surface-sensitivity.test.ts`.
 *
 * ── WHAT THIS AGENT IS FOR (doctrine §7.1: translator, not author) ─────────
 *
 * ORIGINAL = FACT, TRANSLATION = DERIVED. The agent renders the publisher's
 * words in the reader's language and nothing else. It is batched — many
 * short titles in ONE call — because a board shows twenty ads and a call per
 * title would be twenty vendor calls per page.
 *
 * ── THE THINGS IT MUST NEVER DO ────────────────────────────────────────────
 *
 * 1. NEVER CHANGE A NUMBER, A CURRENCY, A DATE, A UNIT OR A PROPER NAME.
 *    "3 svetsare, 35 000 SEK/mån, start 2026-10-01" keeps every one of those
 *    tokens. The reader validates digits before accepting an item.
 * 2. NEVER TRANSLATE A BRAND, EMPLOYER OR PRODUCT NAME, and never add one.
 * 3. NEVER ADD, DROP OR SOFTEN A REQUIREMENT, A CONDITION OR A DISCLAIMER —
 *    it is the publisher's ad, not the platform's.
 * 4. NEVER GUESS: an item it cannot render faithfully is returned with
 *    `title: null` (and the reader keeps the original).
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

/** Most items per call. Twenty is the board's own cap; a little headroom. */
export const VACANCY_TRANSLATION_MAX_ITEMS = 25;

const itemInputSchema = z
  .object({
    /** Opaque per-call id — the reader's own key, never a database id. */
    id: z.string().min(1).max(40),
    title: z.string().min(1).max(400),
    /** Present only when the reader asked for the body of ONE ad. */
    description: z.string().min(1).max(12_000).optional(),
  })
  .strict();

/**
 * `.strict()` is the enforcement: a caller that later tries to "just also
 * pass the employer name" gets a schema failure rather than a quiet widening
 * of what leaves the platform.
 */
export const vacancyTranslationInputSchema = z
  .object({
    sourceLocale: z.string().min(2).max(8),
    targetLocale: z.string().min(2).max(8),
    items: z.array(itemInputSchema).min(1).max(VACANCY_TRANSLATION_MAX_ITEMS),
  })
  .strict();

const itemOutputSchema = z
  .object({
    id: z.string().min(1).max(40),
    /** null = could not render faithfully; the original stands. */
    title: z.string().min(1).max(600).nullable(),
    description: z.string().min(1).max(16_000).nullable(),
  })
  .strict();

const vacancyTranslationData = z
  .object({
    items: z.array(itemOutputSchema).max(VACANCY_TRANSLATION_MAX_ITEMS),
  })
  .strict();

export const vacancyTranslationOutputSchema = aiEnvelopeSchema(
  "vacancy_translation",
  vacancyTranslationData,
);

export const vacancyTranslationEntry: PromptRegistryEntry = {
  agent: "vacancy_translation",
  version: "1.0.0",
  title: "Vacancy Translation Agent (public job advertisements)",
  system: [
    "You translate the TITLE and, when given, the DESCRIPTION of publicly published",
    "job advertisements from `sourceLocale` into `targetLocale`. Return one output",
    "item per input item, with the SAME `id`. Keep every number, currency, date,",
    "unit, time, employer/brand/product name and URL EXACTLY as written. Do not add,",
    "remove or soften any requirement, condition or disclaimer. Do not summarise.",
    "Do not add information. Keep formatting (line breaks, bullet marks) of a",
    "description. If an item cannot be rendered faithfully, return `title: null`",
    "for it. `description` is null whenever no description was given. Return ONLY",
    "the JSON envelope.",
  ].join(" "),
  inputSchema: vacancyTranslationInputSchema,
  outputSchema: vacancyTranslationOutputSchema,
  safetyRules: [
    "Never change a number, currency, date, unit, proper name or URL.",
    "Never add, drop or soften a requirement, condition or disclaimer.",
    "Never summarise or add information; translate only.",
    "Return null for an item that cannot be rendered faithfully.",
  ],
  allowedEvidenceSources: ["public_vacancy"],
  blockedClaims: ["guaranteed", "verified", "recommended for you", "you qualify"],
  lastUpdated: "2026-09-22",
};
