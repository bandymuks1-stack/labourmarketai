import { z } from "zod";

import { SELF_DECLARED_RELATIONSHIPS } from "@/lib/player-card/work-history-model";

/**
 * Zod input schemas for the executable worker conversation actions (Phase B).
 * Every dispatched write is validated against one of these server-side BEFORE
 * the canonical handler runs — so an LLM-proposed or hand-crafted payload can
 * never reach a server action with an unexpected shape. Kept isomorphic (no
 * server-only import) so both the dispatcher and the UI can share them.
 */

const year = z.number().int().min(1900).max(2100);
const month = z.number().int().min(1).max(12);
const triState = z.enum(["not_stated", "yes", "no"]);
const uuid = z.string().uuid();

export const workerAddWorkHistorySchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    /** Employment, placement or volunteering. Defaults to `employee` so an
     *  older client that never sent the field keeps working unchanged. */
    relationship: z.enum(SELF_DECLARED_RELATIONSHIPS).default("employee"),
    startYear: year,
    startMonth: month.nullable().optional(),
    endYear: year.nullable().optional(),
    endMonth: month.nullable().optional(),
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.isCurrent || v.endYear != null, {
    message: "end year required unless ongoing",
    path: ["endYear"],
  });

export const workerAddLanguageSchema = z.object({
  lang: z.string().trim().min(2).max(40),
  level: z.string().trim().min(1).max(8),
});

export const workerAddEducationSchema = z.object({
  institution: z.string().trim().min(2).max(200),
  program: z.string().trim().max(200).nullable().optional(),
  educationTypeSlug: z.string().trim().min(1).max(64),
  startYear: year.nullable().optional(),
  endYear: year.nullable().optional(),
  isCurrent: z.boolean().default(false),
});

export const workerAddAchievementSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  achievedYear: year.nullable().optional(),
  kind: z.enum(["achievement", "declared_certificate"]).default("achievement"),
});

export const workerSaveWorkCardSchema = z
  .object({
    availabilityStatus: z.enum(["available", "busy", "unavailable"]).nullable().optional(),
    availableFrom: z.string().trim().max(10).nullable().optional(), // YYYY-MM-DD
    salaryMin: z.number().int().min(0).max(100000).nullable().optional(),
    salaryMax: z.number().int().min(0).max(100000).nullable().optional(),
    locationCountry: z.string().trim().length(2).nullable().optional(),
    preferredCountries: z.array(z.string().trim().length(2)).max(12).optional(),
  })
  .refine(
    (v) =>
      v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax,
    { message: "salary min must be <= max", path: ["salaryMax"] },
  );

export const workerSavePreferencesSchema = z.object({
  willingToRelocate: triState.optional(),
  needsAccommodation: triState.optional(),
  hasTransport: triState.optional(),
  teamAvailable: triState.optional(),
  soloAvailable: triState.optional(),
  maxTripDays: z.number().int().min(0).max(365).nullable().optional(),
  preferredContractType: z.string().trim().max(40).nullable().optional(),
  availabilityNote: z.string().trim().max(500).nullable().optional(),
});

export const workerRespondBookingSchema = z.object({
  bookingId: uuid,
  decision: z.enum(["accepted", "declined"]),
  reasonKind: z.string().trim().max(64).nullable().optional(),
  reasonNote: z.string().trim().max(500).nullable().optional(),
});

export const workerExpressInterestSchema = z.object({
  requestId: uuid,
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Log a work-journal entry from the conversation. `notes` is the worker's own
 * words (the entry evidence → journal `original_text`); `engagementContextId`
 * pins it to a real work context (doctrine §5.5, required by the canonical
 * `create_journal_entry_full` RPC). `workDate`/`siteName` become real metrics.
 * Times/hours are NOT sent as separate claims — they already live in the notes;
 * the client shows them only as a parse preview to confirm.
 */
export const workerLogWorkSchema = z.object({
  engagementContextId: uuid,
  notes: z.string().trim().min(3).max(4000),
  workDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  siteName: z.string().trim().max(200).nullable().optional(),
});

/** Map of action id → schema for the executable worker actions. */
export const WORKER_ACTION_SCHEMAS = {
  "worker.add-work-history": workerAddWorkHistorySchema,
  "worker.add-language": workerAddLanguageSchema,
  "worker.add-education": workerAddEducationSchema,
  "worker.add-achievement": workerAddAchievementSchema,
  "worker.save-work-card": workerSaveWorkCardSchema,
  "worker.save-preferences": workerSavePreferencesSchema,
  "worker.respond-booking": workerRespondBookingSchema,
  "worker.express-interest": workerExpressInterestSchema,
  "worker.log-work": workerLogWorkSchema,
} as const;

export type WorkerActionId = keyof typeof WORKER_ACTION_SCHEMAS;
