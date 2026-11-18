/**
 * Activity-type model — the universal vocabulary for "what a labour-market
 * participant records / claims / offers / needs". Today only `work_done`
 * and `skill_claim` have UI (Work Journal entry + profile-skills confirm).
 * Everything else is documented as preparing here so future product moves
 * extend the model without touching every page.
 *
 * No DB tables exist for the preparing rows — they are pure config.
 *
 * UI surfaces that branch on activity type (e.g. composer placeholders or
 * confirmation copy) should read from this file rather than hardcoding the
 * list.
 */

import type { CatalogEvidence } from "./feature-availability";

export type Availability = "active" | "preparing" | "hidden";

export type ActivityTypeId =
  | "work_done"
  | "skill_claim"
  | "service_offer"
  | "worker_need"
  | "project_need"
  | "team_offer"
  | "company_activity"
  | "learning_goal"
  | "business_idea"
  | "document_record";

export type ActivityType = {
  id: ActivityTypeId;
  labelKey: string;
  /** Short hint of who typically records this. UI may use it as a chip
   *  beside the label. */
  audienceKey?: string;
  availability: Availability;
  /** Whether the user CONFIRMS each record before it's saved (true for
   *  Work Journal entries today). Future activity types may differ. */
  requiresUserConfirmation: boolean;
  /** Production proof of an `active` type (see CatalogEvidence). */
  evidence?: readonly CatalogEvidence[];
  /** Concrete reason a type is not `active` (internal). */
  reason?: string;
};

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  {
    id: "work_done",
    labelKey: "activityTypes.work_done",
    availability: "active",
    evidence: [{ register: "2.19", proof: "41279196446" }],
    requiresUserConfirmation: true,
  },
  {
    id: "skill_claim",
    labelKey: "activityTypes.skill_claim",
    availability: "active",
    evidence: [{ register: "2.15", proof: "41282258795" }],
    requiresUserConfirmation: true,
  },
  {
    id: "service_offer",
    labelKey: "activityTypes.service_offer",
    availability: "active",
    evidence: [{ register: "6.1", proof: "41729310761" }],
    requiresUserConfirmation: true,
  },
  {
    id: "worker_need",
    labelKey: "activityTypes.worker_need",
    availability: "active",
    evidence: [{ register: "SC-5", proof: "41672031864" }, { register: "4.1", proof: "41279196446" }],
    requiresUserConfirmation: true,
  },
  {
    id: "project_need",
    labelKey: "activityTypes.project_need",
    availability: "active",
    evidence: [{ register: "C-1", proof: "41785749357" }, { register: "SC-6", proof: "41785749357" }],
    requiresUserConfirmation: true,
  },
  {
    id: "team_offer",
    labelKey: "activityTypes.team_offer",
    availability: "active",
    evidence: [{ register: "4.6", proof: "41350506578" }],
    requiresUserConfirmation: true,
  },
  {
    id: "company_activity",
    labelKey: "activityTypes.company_activity",
    availability: "preparing",
    reason: "No production walk records a company activity as its own record type yet.",
    requiresUserConfirmation: true,
  },
  {
    id: "learning_goal",
    labelKey: "activityTypes.learning_goal",
    availability: "preparing",
    reason: "J-12 proves cohorts, practice and competency (11.1-11.7), but no walk records a personal learning goal as an activity.",
    requiresUserConfirmation: true,
  },
  {
    id: "business_idea",
    labelKey: "activityTypes.business_idea",
    availability: "preparing",
    reason: "Not built: no surface records a business idea.",
    requiresUserConfirmation: true,
  },
  {
    id: "document_record",
    labelKey: "activityTypes.document_record",
    availability: "active",
    evidence: [{ register: "HR-2", proof: "41786102850" }, { register: "2.18", proof: "41716118134" }],
    requiresUserConfirmation: true,
  },
] as const;

export const ACTIVITY_TYPE_BY_ID: Record<ActivityTypeId, ActivityType> =
  Object.fromEntries(ACTIVITY_TYPES.map((a) => [a.id, a])) as Record<
    ActivityTypeId,
    ActivityType
  >;

export const ACTIVE_ACTIVITY_TYPES: readonly ActivityType[] =
  ACTIVITY_TYPES.filter((a) => a.availability === "active");
