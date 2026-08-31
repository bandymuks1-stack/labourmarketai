/**
 * The shapes the three read capabilities return, as this client renders them.
 *
 * These are PRESENTATION mirrors of the payloads the capability registry
 * builds (`apps/web/lib/capabilities/registry.ts` — `profile.get`,
 * `journal.list`, `living_cv.skills.get`), not a second domain model: every
 * field is a recorded fact the server already derived, and nothing here is
 * computed, defaulted or re-scored on the device.
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
