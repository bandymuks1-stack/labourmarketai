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
