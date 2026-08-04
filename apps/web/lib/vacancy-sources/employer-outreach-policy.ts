/**
 * EMPLOYER OUTREACH ELIGIBILITY POLICY — a decision function, not a sender.
 *
 * NOTHING IN THIS MODULE CONTACTS ANYONE. It has no IO, no transport, no
 * queue and no persistence. It answers exactly one question — "may a human be
 * ASKED whether to contact this company?" — and its most common answer is no.
 *
 * WHY THE 30-DAY FLOOR EXISTS. Arbetsförmedlingen gave us open, keyless, CC0
 * access to Sweden's public vacancies. Turning that into same-day outbound
 * sales against the employers who posted them would be using a public good as
 * a lead list, and would put the provider relationship — the thing that makes
 * the whole integration possible — at risk to win one deal. Supply and market
 * completeness for workers come first. A vacancy still open a month later is
 * a genuine signal that the employer has an unmet need; a vacancy posted
 * yesterday is just a vacancy.
 *
 * THE RULES, all of which fail closed:
 *   - days 0–29 after publication: outreach prohibited, no exceptions;
 *   - day 30+: the company becomes eligible for HUMAN REVIEW only. Eligible
 *     is not approved. Nothing here can produce "send";
 *   - approval is per COMPANY, never per vacancy — an employer with eleven
 *     open ads must not receive eleven messages;
 *   - at most ONE initial contact, ever;
 *   - automatic follow-up: impossible. There is no state that permits a
 *     second message, so no caller can construct one;
 *   - opt-out is permanent and outranks every other input;
 *   - once a company claims its presence here, external outreach eligibility
 *     ends — they are a user now, not a prospect;
 *   - a missing, unparseable or future publication date DENIES. If we cannot
 *     prove 30 days have passed, they have not passed.
 *
 * Pure module: no IO, no env, no fetch, no Date.now — the clock is an input,
 * so every branch is deterministic and testable.
 */

/** Full days that must pass after publication before human review is allowed. */
export const OUTREACH_MIN_AGE_DAYS = 30;

/** Hard cap on initial contacts per company. Not configurable on purpose. */
export const OUTREACH_MAX_INITIAL_CONTACTS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Company-level outreach state. These are INTERNAL names — they are machine
 * states for an operator console, and none of them may ever be rendered to a
 * normal user (guard-pinned).
 */
export type EmployerOutreachState =
  | "ineligible_too_new"
  | "eligible_for_human_review"
  | "approved_for_single_contact"
  | "contacted"
  | "opted_out"
  | "company_claimed";

/** Why the policy answered as it did. Stable codes, never sentences. */
export type OutreachDenyReason =
  | "opted_out"
  | "company_claimed"
  | "already_contacted"
  | "publication_date_missing"
  | "publication_date_invalid"
  | "publication_date_in_future"
  | "too_new"
  | "company_key_missing"
  | "not_yet_human_approved";

export interface EmployerOutreachInputV1 {
  /**
   * Stable company identity. Outreach is deduplicated on THIS, not on the
   * vacancy — that is what makes "one message per company" enforceable.
   * Missing key denies: we cannot promise one-per-company without one.
   */
  readonly companyKey: string | null;
  /** Publisher's publication date for the oldest qualifying vacancy. */
  readonly publishedAt: string | null;
  /** Evaluation clock (ms). An input, never read from the environment. */
  readonly nowMs: number;
  /** Has this company already received its one initial contact? */
  readonly alreadyContacted: boolean;
  /** Permanent. Once true, never false again. */
  readonly optedOut: boolean;
  /** Has the company claimed its presence inside labourmarket.ai? */
  readonly companyClaimed: boolean;
  /**
   * Has a HUMAN explicitly approved contacting this company? Defaults to
   * false. No computation in this module can set it — only a person can, and
   * that is the point.
   */
  readonly humanApproved?: boolean;
}

export interface EmployerOutreachDecisionV1 {
  readonly state: EmployerOutreachState;
  /**
   * True ONLY in `approved_for_single_contact`. Even then this module sends
   * nothing — it reports that a human said yes to one message.
   */
  readonly mayContact: boolean;
  /** True when a human may be shown this company and asked to decide. */
  readonly mayRequestHumanReview: boolean;
  readonly denyReasons: readonly OutreachDenyReason[];
  /** Full days since publication, or null when it could not be established. */
  readonly ageDays: number | null;
  /** Days remaining until review eligibility; 0 once eligible, null if unknown. */
  readonly daysUntilEligible: number | null;
}

function deny(
  state: EmployerOutreachState,
  reasons: readonly OutreachDenyReason[],
  ageDays: number | null = null,
  daysUntilEligible: number | null = null,
): EmployerOutreachDecisionV1 {
  return {
    state,
    mayContact: false,
    mayRequestHumanReview: false,
    denyReasons: reasons,
    ageDays,
    daysUntilEligible,
  };
}

/**
 * Full days elapsed between publication and now. Returns a reason code rather
 * than a number when the date cannot be trusted.
 */
function elapsedFullDays(
  publishedAt: string | null,
  nowMs: number,
): { days: number } | { reason: OutreachDenyReason } {
  if (typeof publishedAt !== "string" || publishedAt.trim().length === 0) {
    return { reason: "publication_date_missing" };
  }
  const publishedMs = Date.parse(publishedAt);
  if (!Number.isFinite(publishedMs)) {
    return { reason: "publication_date_invalid" };
  }
  if (!Number.isFinite(nowMs)) {
    return { reason: "publication_date_invalid" };
  }
  if (publishedMs > nowMs) {
    // A publication date in the future is either a bad parse or a bad feed.
    // Either way it cannot be used to prove that 30 days have passed.
    return { reason: "publication_date_in_future" };
  }
  return { days: Math.floor((nowMs - publishedMs) / MS_PER_DAY) };
}

/**
 * Evaluate outreach eligibility for ONE company.
 *
 * Precedence is deliberate: the permanent, person-level facts (opt-out, then
 * claim, then already-contacted) are checked BEFORE anything to do with time.
 * A company that opted out does not become contactable again by ageing.
 */
export function evaluateEmployerOutreach(
  input: EmployerOutreachInputV1,
): EmployerOutreachDecisionV1 {
  // 1. Opt-out is permanent and outranks everything.
  if (input.optedOut) {
    return deny("opted_out", ["opted_out"]);
  }

  // 2. A company that manages its own presence here is not a cold prospect.
  if (input.companyClaimed) {
    return deny("company_claimed", ["company_claimed"]);
  }

  // 3. One initial contact, ever. There is no path from here to a second.
  if (input.alreadyContacted) {
    return deny("contacted", ["already_contacted"]);
  }

  // 4. Without a stable company key we cannot guarantee one-per-company.
  if (
    typeof input.companyKey !== "string" ||
    input.companyKey.trim().length === 0
  ) {
    return deny("ineligible_too_new", ["company_key_missing"]);
  }

  // 5. Age. Anything unprovable denies.
  const elapsed = elapsedFullDays(input.publishedAt, input.nowMs);
  if ("reason" in elapsed) {
    return deny("ineligible_too_new", [elapsed.reason]);
  }
  if (elapsed.days < OUTREACH_MIN_AGE_DAYS) {
    return deny(
      "ineligible_too_new",
      ["too_new"],
      elapsed.days,
      OUTREACH_MIN_AGE_DAYS - elapsed.days,
    );
  }

  // 6. Old enough. This makes the company REVIEWABLE, nothing more.
  if (input.humanApproved !== true) {
    return {
      state: "eligible_for_human_review",
      mayContact: false,
      mayRequestHumanReview: true,
      denyReasons: ["not_yet_human_approved"],
      ageDays: elapsed.days,
      daysUntilEligible: 0,
    };
  }

  // 7. A human said yes, to exactly one message.
  return {
    state: "approved_for_single_contact",
    mayContact: true,
    mayRequestHumanReview: false,
    denyReasons: [],
    ageDays: elapsed.days,
    daysUntilEligible: 0,
  };
}

/**
 * Collapse many vacancies belonging to one company into the SINGLE decision
 * that governs that company. The oldest qualifying vacancy sets the age — a
 * company whose need has been open longest is the one worth a conversation,
 * and using the newest ad would reset the clock every time they repost.
 *
 * Returns one decision per company key, so a caller physically cannot produce
 * one message per vacancy.
 */
export function evaluateEmployerOutreachByCompany(
  vacancies: readonly {
    readonly companyKey: string | null;
    readonly publishedAt: string | null;
  }[],
  context: Omit<EmployerOutreachInputV1, "companyKey" | "publishedAt"> & {
    /** Per-company facts the caller already holds. Absent = all false. */
    readonly companyFacts?: ReadonlyMap<
      string,
      {
        readonly alreadyContacted?: boolean;
        readonly optedOut?: boolean;
        readonly companyClaimed?: boolean;
        readonly humanApproved?: boolean;
      }
    >;
  },
): ReadonlyMap<string, EmployerOutreachDecisionV1> {
  // Oldest publication per company.
  const oldest = new Map<string, string | null>();
  for (const v of vacancies) {
    const key = v.companyKey?.trim();
    if (!key) continue;
    const current = oldest.get(key);
    if (current === undefined) {
      oldest.set(key, v.publishedAt);
      continue;
    }
    const a = current === null ? null : Date.parse(current);
    const b = v.publishedAt === null ? null : Date.parse(v.publishedAt);
    if (a === null || !Number.isFinite(a)) continue;
    if (b !== null && Number.isFinite(b) && b < a) {
      oldest.set(key, v.publishedAt);
    }
  }

  const out = new Map<string, EmployerOutreachDecisionV1>();
  for (const [companyKey, publishedAt] of oldest) {
    const facts = context.companyFacts?.get(companyKey);
    out.set(
      companyKey,
      evaluateEmployerOutreach({
        companyKey,
        publishedAt,
        nowMs: context.nowMs,
        alreadyContacted: facts?.alreadyContacted ?? context.alreadyContacted,
        optedOut: facts?.optedOut ?? context.optedOut,
        companyClaimed: facts?.companyClaimed ?? context.companyClaimed,
        humanApproved: facts?.humanApproved ?? context.humanApproved,
      }),
    );
  }
  return out;
}
