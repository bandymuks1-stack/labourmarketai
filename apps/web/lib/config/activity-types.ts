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
};

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  {
    id: "work_done",
    labelKey: "activity.work_done",
    availability: "active",
    requiresUserConfirmation: true,
  },
  {
    id: "skill_claim",
    labelKey: "activity.skill_claim",
    availability: "active",
    requiresUserConfirmation: true,
  },
  {
    id: "service_offer",
    labelKey: "activity.service_offer",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "worker_need",
    labelKey: "activity.worker_need",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "project_need",
    labelKey: "activity.project_need",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "team_offer",
    labelKey: "activity.team_offer",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "company_activity",
    labelKey: "activity.company_activity",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "learning_goal",
    labelKey: "activity.learning_goal",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "business_idea",
    labelKey: "activity.business_idea",
    availability: "preparing",
    requiresUserConfirmation: true,
  },
  {
    id: "document_record",
    labelKey: "activity.document_record",
    availability: "preparing",
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
