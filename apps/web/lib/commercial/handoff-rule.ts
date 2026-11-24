/**
 * THE COMMERCIAL SIGNAL RULE — a decision function, not a sender.
 *
 * Owner chain (2026-09-17): a real worker → a real vacancy → a real employer
 * → a real action. Not every saved job, viewed job or weak match is a
 * commercial opportunity for Nonstop. The event that IS one, stated as
 * explicit criteria and never as a score:
 *
 *   1. the worker has a CANONICAL identity that the ONE matching engine can
 *      read (the board's own gate: a work type AND skill evidence);
 *   2. a REAL canonical vacancy exists — a live row of `public_vacancies`
 *      (v1 scope: public-source ads; a platform demand's owner already
 *      receives the interest in-product, and a Nonstop approach to a
 *      platform customer is an OPEN owner decision, not a default);
 *   3. the worker EXPLICITLY expressed interest in THAT vacancy (a stored
 *      `demand_interest_signals` row with status `interested`) — not a
 *      bookmark, not a view, not a system match;
 *   4. the employer is IDENTIFIABLE from the publisher's own data: a name
 *      AND a stable identity (organisation id, or a homepage host) — that
 *      identity is the per-company key the outreach policy deduplicates on;
 *   5. the event is ELIGIBLE for Nonstop follow-up: nothing forbids it
 *      outright. The RECENCY FLOOR of `employer-outreach-policy.ts` does not
 *      veto the handoff — it is recorded ON it (`outreach_state`), because
 *      the floor governs WHEN a human may be asked about contact, and a
 *      too-new vacancy becomes eligible by waiting, not by being forgotten.
 *
 * Every criterion is re-checked IN THE DATABASE by `create_commercial_handoff_v1`
 * (SECURITY DEFINER; migration 20260917160000). This module is the same
 * rule stated once in TypeScript so the surfaces can say, before the click,
 * whether an interest WILL become a Nonstop opportunity — and so the reason
 * it will not is a stable code, never a guess.
 *
 * Pure: no IO, no env, no clock (the clock is an input).
 */
import {
  evaluateEmployerOutreach,
  type EmployerOutreachState,
} from "@/lib/vacancy-sources/employer-outreach-policy";

export const COMMERCIAL_HANDOFF_KIND = "worker_vacancy_interest" as const;
export const COMMERCIAL_HANDOFF_SCHEMA_VERSION = 1 as const;

/** The worker's explicit answer to "may Nonstop present me to this
 *  employer?" — a SEPARATE consent from interest, from referral, from joining.
 *  Versioned like the referral consent (`worker-broader-search-v1`). */
export const EMPLOYER_PROPOSITION_CONSENT_VERSION = "employer-proposition-v1" as const;

export type CommercialIneligibilityCode =
  | "worker_not_matchable"
  | "not_public_vacancy"
  | "vacancy_not_live"
  | "interest_not_active"
  | "employer_not_identifiable"
  | "publication_date_unusable";

export interface CommercialHandoffInputV1 {
  /** The board's canonical matchability gate for this worker. */
  readonly workerMatchable: boolean;
  /** The interest row's source: exactly one of the two. */
  readonly source: "public_vacancy" | "platform_demand";
  readonly interestStatus: "interested" | "withdrawn" | "reviewed" | "contacted";
  readonly vacancyLive: boolean;
  readonly employer: {
    readonly name: string | null;
    readonly externalOrgId: string | null;
    readonly homepage: string | null;
  };
  /** Publisher's own publication date (ISO) — for the recency floor. */
  readonly publishedAt: string | null;
  /** Evaluation clock (ms). Never read from the environment here. */
  readonly nowMs: number;
}

export type CommercialHandoffDecision =
  | {
      readonly eligible: true;
      /** Stable per-company key; the DB computes the same one. */
      readonly employerKeyHint: "org" | "host";
      /** The outreach policy's verdict at this moment — recorded, not a veto. */
      readonly outreachState: EmployerOutreachState;
    }
  | { readonly eligible: false; readonly reason: CommercialIneligibilityCode };

export function decideCommercialHandoff(
  input: CommercialHandoffInputV1,
): CommercialHandoffDecision {
  if (!input.workerMatchable) return { eligible: false, reason: "worker_not_matchable" };
  if (input.source !== "public_vacancy") return { eligible: false, reason: "not_public_vacancy" };
  if (input.interestStatus !== "interested") {
    return { eligible: false, reason: "interest_not_active" };
  }
  if (!input.vacancyLive) return { eligible: false, reason: "vacancy_not_live" };
  const name = input.employer.name?.trim() ?? "";
  const org = input.employer.externalOrgId?.trim() ?? "";
  const host = input.employer.homepage?.trim() ?? "";
  if (!name || (!org && !host)) {
    return { eligible: false, reason: "employer_not_identifiable" };
  }
  if (!input.publishedAt || Number.isNaN(Date.parse(input.publishedAt))) {
    return { eligible: false, reason: "publication_date_unusable" };
  }
  if (Date.parse(input.publishedAt) > input.nowMs) {
    return { eligible: false, reason: "publication_date_unusable" };
  }
  // The recency floor: the SAME pure policy the operator console uses.
  // Nothing about the worker's interest can shorten it.
  const outreach = evaluateEmployerOutreach({
    companyKey: org ? `org:${org}` : `host:${host.toLowerCase()}`,
    publishedAt: input.publishedAt,
    nowMs: input.nowMs,
    alreadyContacted: false,
    optedOut: false,
    companyClaimed: false,
    humanApproved: false,
  });
  return {
    eligible: true,
    employerKeyHint: org ? "org" : "host",
    outreachState: outreach.state,
  };
}

/** The worker's proposition consent as the form produces it. Anything else
 *  is stored by the RPC as `{given:false}` — the DB never trusts the shape. */
export interface EmployerPropositionConsentV1 {
  readonly given: boolean;
  readonly version: typeof EMPLOYER_PROPOSITION_CONSENT_VERSION;
}

export function buildPropositionConsent(given: boolean): EmployerPropositionConsentV1 {
  return { given: given === true, version: EMPLOYER_PROPOSITION_CONSENT_VERSION };
}
