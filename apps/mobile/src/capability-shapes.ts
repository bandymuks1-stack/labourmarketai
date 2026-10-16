/**
 * The shapes the capabilities this client calls return, as it renders them.
 *
 * These are PRESENTATION mirrors of the payloads the capability registry
 * builds (`apps/web/lib/capabilities/registry.ts` — `profile.get`,
 * `journal.list`, `living_cv.skills.get`, `journal.create_draft`,
 * `journal.confirm`), not a second domain model: every field is a recorded
 * fact the server already derived, and nothing here is computed, defaulted or
 * re-scored on the device.
 */

export type ProfileGetData = {
  readonly profile: {
    readonly id: string;
    readonly fullName: string | null;
    readonly email: string | null;
    readonly locale: string | null;
    readonly country: string | null;
    readonly onboarded: boolean | null;
    readonly activeRole: string | null;
  };
  /** Three-valued on purpose: unknown ≠ absent (#1314). */
  readonly worker:
    | { readonly status: "unavailable" }
    | { readonly status: "exists"; readonly workerId: string }
    | { readonly status: "none" };
  /**
   * The roles the account actually HOLDS — the plural of `activeRole`, which
   * is only whichever one the person is in right now. One person, many
   * contexts (I-1): the two are different facts and the singular never stands
   * in for the set.
   *
   * `unavailable` is a first-class state and not a formality. A failed roles
   * read rendered as an empty set told a person who manages three companies
   * that they hold nothing — live on the web shell, 2026-08-28. A client must
   * say it could not ask.
   *
   * `roles` is the RBAC set AS RECORDED and carries values that are not
   * participation modes (`admin` among them). Map through
   * `PARTICIPATION_MODES`, filtering — never assume the two vocabularies are
   * the same list.
   */
  readonly heldRoles:
    | { readonly status: "unavailable" }
    | { readonly status: "known"; readonly roles: readonly string[] };
};

export type JournalEntry = {
  readonly entryId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly engagementContextId: string | null;
  readonly metrics: readonly {
    readonly slug: string;
    readonly valueText: string | null;
    readonly valueNumeric: number | null;
    readonly unitSlug: string | null;
  }[];
  readonly confirmations: number;
};

export type JournalListData = {
  readonly workerId: string;
  readonly entries: readonly JournalEntry[];
};

/**
 * `journal.create_draft` — TWO answers, and the difference is the whole point.
 *
 * The capability resolves the entry's work context itself from the caller's
 * own active contexts. When exactly one applies it returns a preview and a
 * one-time confirmation token; when more than one could apply — or the client
 * named a context that is not the caller's — it returns the labelled options
 * and mints NO token, because the human has to choose. Neither answer writes
 * anything.
 *
 * Discriminated by the presence of `preview`, which is what the server's own
 * two shapes actually differ by.
 */
export type JournalEngagementOption = {
  readonly id: string;
  readonly label: string;
};

export type JournalDraftPreview = {
  readonly workDate: string;
  readonly siteName: string | null;
  readonly notes: string;
  readonly engagementContextId: string;
  /** The resolved context, NAMED — a person must see where the entry lands
   *  before confirming. Null when the server could not name it. */
  readonly engagementLabel: string | null;
};

export type JournalCreateDraftData =
  | {
      readonly status: "engagement_choice_required";
      readonly options: readonly JournalEngagementOption[];
      readonly note: string;
    }
  | {
      readonly preview: JournalDraftPreview;
      readonly confirmationToken: string;
      readonly note: string;
    };

/**
 * `journal.confirm` — the real append-only write, and the REAL awaited outcome
 * of the Living CV pipeline behind it. Every number here is the server's own
 * count; this client displays them and derives nothing.
 */
export type JournalConfirmData = {
  readonly entryId: string;
  readonly skills: {
    readonly status: "completed" | "partial" | "failed";
    readonly added: number;
    readonly strengthened: number;
    readonly reviewNeeded: number;
    readonly claimsSaved: number;
    readonly cvUpdated: boolean;
  };
};

/**
 * `journal.work_intelligence.get` — the SAME figures the web "work in
 * numbers" section, ŠIANDIEN and the Living CV show, from the one work-time
 * rule on the server. The shape lives in `@labourmarket/client-core`
 * (`work-figures.ts`) because the ordering rules over it are proven there;
 * this alias keeps every capability shape discoverable from one file.
 */
export type { WorkIntelligenceData } from "@labourmarket/client-core";

export type LivingCvSkillsData = {
  readonly workerId: string;
  readonly skills: readonly {
    readonly skillId: string;
    readonly slug: string | null;
    readonly verified: boolean;
    readonly source: string | null;
    readonly verifiedAt: string | null;
  }[];
};

/**
 * `context.list` — WHICH WORKSPACES THE PERSON HOLDS, and which one the
 * durable pointer currently makes active.
 *
 * This is the WORKSPACE axis, and it is deliberately NOT `ActorContext`.
 * `ActorContext.mode` is a PARTICIPATION MODE — how a person takes part
 * (worker / company / agency / customer) — while `organizationType` says what
 * the ORGANIZATION is and `relationship` says how the person stands in it. A
 * company-type organization does not make its employee an employer, so
 * deriving a mode from either field would reclassify a real person's role from
 * data that does not carry it (SEP-5, IDENTITY ≠ ROLE). The two axes stay
 * apart, and `ContextHoldings` stays honestly `unknown` until the
 * participation-mode holdings are themselves readable.
 *
 * `label` is the SERVER's label — the canonical workspace label a web user
 * reads for the same organization, including the "no name stored" phrasing for
 * organizations that have none. The client never builds one.
 */
export type ContextListData = {
  readonly workspaces: readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: "personal" | "organization";
    readonly organizationType: "company" | "agency" | "team" | "other" | null;
    readonly relationship: "owner" | "manager" | "employee" | "other" | null;
    readonly active: boolean;
  }[];
  readonly activeWorkspaceId: string;
  /**
   * FALSE means this environment records no durable pointer, so
   * `activeWorkspaceId` is the resolver's DEFAULT rather than a stored choice
   * and a bearer client cannot switch. A screen must say so rather than offer
   * a control that would be refused.
   */
  readonly pointerAvailable: boolean;
  readonly note: string;
};

/** `context.switch` — the durable pointer write. */
export type ContextSwitchData =
  | {
      readonly status: "switched";
      readonly workspaceId: string;
      readonly label: string;
      readonly durablePointer: boolean;
    }
  | {
      readonly status: "workspace_choice_required";
      readonly options: readonly { readonly id: string; readonly label: string }[];
      readonly note: string;
    };

/**
 * `interest.express_draft` — the SAME two-answer shape as the journal draft.
 * Called with no `requestId` it answers with the needs this account can SEE
 * (its own opportunity board, under its own RLS) as labelled options and
 * mints no token; called with one of those ids it answers with a preview and
 * a one-time token. Neither answer sends anything. A refusal
 * (`no_visible_demand`, `no_worker_profile`) is a finding the screen names.
 */
export type InterestOption = {
  readonly id: string;
  readonly label: string;
};

export type InterestDraftPreview = {
  readonly requestId: string;
  /** The server's label for the need — never composed on the device. */
  readonly demandLabel: string;
  readonly note: string | null;
  /** HONEST repeat: the domain refreshes a repeat express and keeps the
   *  status; the person is told before confirming that it is a repeat. */
  readonly alreadyExpressed: boolean;
};

export type InterestDraftData =
  | {
      readonly status: "demand_choice_required";
      readonly options: readonly InterestOption[];
      readonly note: string;
    }
  | {
      readonly preview: InterestDraftPreview;
      readonly confirmationToken: string;
      readonly note: string;
    };

/** `interest.express_confirm` — the canonical express-interest write. */
export type InterestConfirmData = {
  readonly status: string;
  readonly structuredDestination: string;
};

/**
 * `workforce.availability` — the caller's active roster over the next 7
 * days in three honest states. COMMITTED IS NOT UNAVAILABLE: `constraint`
 * and `overridable` carry the difference (SEP-2), and `absencesKnown` /
 * `commitmentsKnown` say which inputs actually answered, so an unread
 * source is never shown as "nobody is busy" (SEP-7). Refused outside an
 * employer workspace (`personal_workspace`, `no_organization`,
 * `no_company_context`, `needs_migration`).
 */
export type WorkforceAvailabilityData = {
  readonly actingFor: string;
  readonly from?: string;
  readonly to?: string;
  readonly rosterTotal: number;
  readonly rows: readonly {
    readonly label: string;
    readonly state: "free" | "committed" | "unavailable";
    readonly constraint: "none" | "commitment" | "hard_constraint";
    readonly overridable: boolean;
    readonly notFreeUntil: string | null;
    readonly committedTo: string | null;
  }[];
  readonly absencesKnown?: boolean;
  readonly commitmentsKnown?: boolean;
  readonly note?: string;
};

/**
 * `jobs.search` / `jobs.get` — the PUBLIC vacancy board in its anonymous
 * projection (the database function enumerates the safe columns; no title,
 * employer, place, source or application link ever reach a client here).
 * `webPath` is the member page for the signed-in person's browser, where the
 * full details live — this app does not re-derive the member projection.
 * `not_provisioned` and a timeout are refusals by name (`needs_migration`,
 * `unavailable`), never an empty board (#1314).
 */
export type PublicJob = {
  readonly id: string;
  readonly professionSlug: string | null;
  readonly occupation: string | null;
  readonly employmentForm: string | null;
  readonly workingTime: string | null;
  readonly positions: number | null;
  readonly compensationCurrency: string | null;
  readonly compensationMin: number | null;
  readonly compensationMax: number | null;
  readonly sourceLanguage: string | null;
  readonly publishedAt: string | null;
  readonly webPath: string;
};

export type JobsSearchData = {
  readonly status: "ok";
  readonly page: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly hasMore: boolean;
  readonly jobs: readonly PublicJob[];
};

export type JobsGetData = { readonly job: PublicJob };

/**
 * `demand.create_draft` → `demand.create_confirm` — a worker-need for the
 * organization the caller is ACTING FOR. The preview names that organization
 * (the server's word), the token binds the exact draft; confirming creates
 * the demand on the one canonical intake. Refused by name outside an employer
 * workspace (`personal_workspace`, `no_organization`, `no_company_context`),
 * and `over_open_need_limit` when the plan's active-position limit is reached.
 */
export type DemandUrgency = "flexible" | "this_week" | "urgent";

export type DemandDraftFields = {
  readonly description: string;
  readonly role?: string;
  readonly location?: string;
  readonly urgency?: DemandUrgency;
  readonly teamSize?: number;
};

export type DemandDraftPreview = {
  readonly actingFor: string;
  readonly intent: string;
  readonly role: string | null;
  readonly description: string;
  readonly teamSize: number | null;
  readonly country: string | null;
  readonly workType: string | null;
  readonly urgency: string | null;
};

export type DemandCreateDraftData = {
  readonly preview: DemandDraftPreview;
  readonly confirmationToken: string;
  readonly note: string;
};

export type DemandCreateConfirmData = {
  readonly status: string;
  readonly requestId: string;
  readonly actingFor: string;
  readonly structuredDestination: string;
};
