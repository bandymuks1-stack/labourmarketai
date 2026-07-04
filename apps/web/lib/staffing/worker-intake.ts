/**
 * Worker intake model (Staffing Operating Model v1, PR2).
 *
 * The canonical, strict shape of a worker's intake — the first step of the
 * staffing chain (intake → AI profile draft → passport → readiness → match →
 * booking). Pure types + zod + a mapping that turns intake into the input the
 * `worker_profile` AI agent drafts a SUGGESTION from. No IO, no SDK, no network.
 *
 * Safety: the intake captures self-declared facts only; nothing here verifies a
 * skill, document, or legality. The AI draft is a suggestion the worker
 * accepts/edits/rejects — never an auto-published profile.
 */
import { z } from "zod";
import { workerProfileInputSchema } from "../ai/registry/agents/worker-profile";

/** How the worker engages — the §3 worker segments. */
export const WORKER_ENGAGEMENT_TYPES = [
  "employee",
  "zzp_self_employed",
  "subcontractor",
  "brigade",
  "agency_supplied",
] as const;
export type WorkerEngagementType = (typeof WORKER_ENGAGEMENT_TYPES)[number];

/** Preferred contract form (self-declared preference, not a legal determination). */
export const CONTRACT_PREFERENCES = [
  "employment",
  "zzp_invoice",
  "subcontract",
  "agency",
  "any",
] as const;
export type ContractPreference = (typeof CONTRACT_PREFERENCES)[number];

/** Accommodation situation on the worker side (a real matching input). */
export const ACCOMMODATION_NEEDS = [
  "needs_accommodation",
  "has_own_accommodation",
  "needs_help_finding",
  "can_share_room",
] as const;
export type AccommodationNeed = (typeof ACCOMMODATION_NEEDS)[number];

export const TRANSPORT_SITUATIONS = [
  "has_transport",
  "has_driving_licence",
  "needs_pickup",
  "none",
] as const;
export type TransportSituation = (typeof TRANSPORT_SITUATIONS)[number];

/**
 * Starter profession directions. Slugs align with the existing
 * messages/[locale]/professions.json taxonomy (Lego section 10); the few not yet
 * in the registry are marked so PR follow-ups can register them — never
 * hardcoded enums in UI.
 */
export const PROFESSION_DIRECTIONS = [
  "general_laborer",
  "carpenter",
  "formwork_carpenter",
  "rebar_worker", // steel fixer
  "concrete_worker",
  "mason", // bricklayer
  "plasterer",
  "drywaller",
  "painter",
  "tiler",
  "roofer",
  "electrician",
  "plumber",
  "welder",
  "hvac_ventilation",
  "mechanic_technician",
  "warehouse_logistics",
  // Universal profession families (professions.json + catalogue migration
  // 20260704120000) — the intake starter list spans the whole labour market;
  // construction is one family among many:
  "driver",
  "warehouse_worker",
  "production_worker",
  "furniture_assembler",
  "cleaner",
  "office_administrator",
  "software_developer",
  "customer_service_specialist",
  "sales_assistant",
  "cook",
  "waiter",
  "gardener",
  "farm_worker",
  "caregiver",
  "event_organizer",
  "translator",
  "teacher",
  "safety_specialist",
] as const;
export type ProfessionDirection = (typeof PROFESSION_DIRECTIONS)[number];

/** ISO-2 country code (2 letters); validated loosely (the registry owns labels). */
const countryCode = z.string().regex(/^[A-Za-z]{2}$/);

export const workerIntakeSchema = z
  .object({
    // identity / contact (self-declared)
    fullName: z.string().min(1).max(160),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(200).optional(),
    currentCountry: countryCode.optional(),
    // work direction
    targetCountries: z.array(countryCode).max(20).default([]),
    /** Profession slug — must be a known direction OR a registry slug. */
    profession: z.string().min(1).max(120),
    experienceYears: z.number().int().min(0).max(70).optional(),
    // CV
    hasCv: z.boolean().default(false),
    canUploadCv: z.boolean().default(false),
    // availability + logistics (real matching inputs)
    availableFrom: z.string().max(40).optional(), // ISO date or "immediately"
    transport: z.enum(TRANSPORT_SITUATIONS).default("none"),
    accommodation: z.enum(ACCOMMODATION_NEEDS).default("needs_accommodation"),
    languages: z.array(z.string().max(40)).max(20).default([]),
    // segment
    worksWith: z.enum(["solo", "brigade"]).default("solo"),
    engagementType: z.enum(WORKER_ENGAGEMENT_TYPES).default("employee"),
    contractPreference: z.enum(CONTRACT_PREFERENCES).default("any"),
    // documents (names/types only — never contents)
    documents: z.array(z.string().max(120)).max(50).default([]),
    // ── ZZP / subcontractor / brigade details (all optional; PR5) ───────────
    // Filled only when the worker offers a SERVICE (ZZP) or a TEAM (brigade),
    // not when applying as an employee. Self-declared; nothing here is verified.
    businessName: z.string().max(200).optional(),
    vatNumber: z.string().max(40).optional(),
    teamSize: z.number().int().min(1).max(200).optional(),
    teamProfessions: z.array(z.string().max(120)).max(40).default([]),
    tools: z.array(z.string().max(120)).max(60).default([]),
    insurance: z.string().max(200).optional(),
    invoiceReady: z.boolean().default(false),
    // free text the AI structures
    comment: z.string().max(8000).optional(),
  })
  .strict();

export type WorkerIntake = z.infer<typeof workerIntakeSchema>;

/**
 * Map an intake into the `worker_profile` agent input so the AI can draft a
 * SUGGESTION (headline, candidate skills, missing fields). The mapping passes
 * only self-declared text + selections — never anything that asserts a fact.
 */
export function buildWorkerProfileAgentInput(
  intake: WorkerIntake,
): z.infer<typeof workerProfileInputSchema> {
  const bioParts = [
    intake.comment?.trim(),
    intake.profession ? "Profession: " + intake.profession : undefined,
    typeof intake.experienceYears === "number"
      ? "Experience: " + String(intake.experienceYears) + " years"
      : undefined,
  ].filter((v): v is string => Boolean(v && v.length));

  return workerProfileInputSchema.parse({
    bio: bioParts.length ? bioParts.join(". ") : undefined,
    selectedCountries: intake.targetCountries.slice(0, 20),
    languagePreferences: intake.languages.slice(0, 20).map((l) => l.slice(0, 8)),
    existingSkills: intake.profession ? [intake.profession] : [],
    existingDocumentsSummary: intake.documents.slice(0, 50),
  });
}
