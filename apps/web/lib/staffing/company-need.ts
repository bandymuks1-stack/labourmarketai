/**
 * Company need / vacancy order model (Staffing Operating Model v1, PR4).
 *
 * The canonical strict shape of a company's labour need — step 7 of the chain.
 * Pure types + zod + a mapping to the `company_need` AI agent, which drafts a
 * normalized vacancy SUGGESTION (clean role, required skills/docs, readiness
 * blockers, missing fields). No IO, no SDK, no network.
 *
 * Safety: nothing here is published or priced automatically; the AI draft is a
 * suggestion the company reviews. No invented pay; no "legally ready" claim.
 */
import { z } from "zod";
import { companyNeedInputSchema } from "../ai/registry/agents/company-need";

/** Engagement model — how the labour is supplied (the section 4/5 models). */
export const ENGAGEMENT_MODELS = [
  "employment",
  "subcontracting",
  "agency_supply",
] as const;
export type EngagementModel = (typeof ENGAGEMENT_MODELS)[number];

/** Crew shape the company needs. */
export const NEED_TEAM_SHAPES = ["solo", "team", "brigade"] as const;
export type NeedTeamShape = (typeof NEED_TEAM_SHAPES)[number];

/** What the company offers for accommodation (a real matching input). */
export const ACCOMMODATION_OFFERS = [
  "provided_free",
  "provided_paid",
  "provided_deducted",
  "not_provided",
] as const;
export type AccommodationOffer = (typeof ACCOMMODATION_OFFERS)[number];

export const URGENCY_LEVELS = ["asap", "weeks", "flexible"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

const countryCode = z.string().regex(/^[A-Za-z]{2}$/);

/** Optional pay-range hint (self-declared by the company; never invented by AI). */
const rateRange = z
  .object({
    min: z.number().min(0).max(1_000_000).optional(),
    max: z.number().min(0).max(1_000_000).optional(),
    unit: z.enum(["hour", "month"]).optional(),
    currency: z.string().max(8).optional(),
  })
  .strict();

export const companyNeedSchema = z
  .object({
    companyName: z.string().min(1).max(200),
    contactPerson: z.string().max(160).optional(),
    country: countryCode,
    cityRegion: z.string().max(160).optional(),
    projectType: z.string().max(200).optional(),
    profession: z.string().min(1).max(120),
    numberOfWorkers: z.number().int().min(1).max(100000).default(1),
    teamShape: z.enum(NEED_TEAM_SHAPES).default("solo"),
    startDate: z.string().max(40).optional(),
    expectedDuration: z.string().max(120).optional(),
    rateRange: rateRange.optional(),
    engagementModel: z.enum(ENGAGEMENT_MODELS).default("employment"),
    accommodationOffer: z.enum(ACCOMMODATION_OFFERS).default("not_provided"),
    transportProvided: z.boolean().default(false),
    languageRequirements: z.array(z.string().max(40)).max(20).default([]),
    acceptsNonEnglish: z.boolean().default(true),
    requiredSkills: z.array(z.string().max(120)).max(40).default([]),
    requiredCertificates: z.array(z.string().max(160)).max(40).default([]),
    requiredDocuments: z.array(z.string().max(160)).max(40).default([]),
    urgency: z.enum(URGENCY_LEVELS).default("flexible"),
    description: z.string().min(1).max(8000),
  })
  .strict();

export type CompanyNeed = z.infer<typeof companyNeedSchema>;

function accommodationPhrase(offer: AccommodationOffer): string {
  switch (offer) {
    case "provided_free":
      return "accommodation provided (free)";
    case "provided_paid":
      return "accommodation provided (paid)";
    case "provided_deducted":
      return "accommodation provided (deducted from pay)";
    default:
      return "accommodation not provided";
  }
}

/**
 * Map a company need into the `company_need` agent input so the AI can draft a
 * normalized vacancy SUGGESTION. Passes the free description + structured context
 * only; it never asks the model for pay or a readiness verdict.
 */
export function buildCompanyNeedAgentInput(
  need: CompanyNeed,
): z.infer<typeof companyNeedInputSchema> {
  return companyNeedInputSchema.parse({
    companyFreeText: need.description,
    country: need.country,
    city: need.cityRegion,
    startDate: need.startDate,
    duration: need.expectedDuration,
    numberOfPeople: need.numberOfWorkers,
    languageRequirement: need.languageRequirements.join(", ") || undefined,
    accommodation: accommodationPhrase(need.accommodationOffer),
    transport: need.transportProvided ? "transport provided" : "transport not provided",
    existingCompanyReadiness: [
      ...need.requiredDocuments.map((d) => "requires document: " + d),
      ...need.requiredCertificates.map((c) => "requires certificate: " + c),
    ].slice(0, 50),
  });
}
