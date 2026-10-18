/**
 * 14-day trial policy — PURE core. No IO.
 *
 * Owner decision (Amivo trial readiness): the ONE paid Organization plan may
 * start with a 14-day trial through the existing Stripe subscription checkout.
 * The price is unchanged; Stripe charges it when the trial ends.
 *
 * ONCE PER ORGANIZATION, FAIL CLOSED. A trial is offered only when the billing
 * subject's subscription history is positively known to be EMPTY:
 *   - plan is the Organization plan (never a free/deferred/personal plan);
 *   - the subject is an organization (a personal subject never gets a trial);
 *   - the local store has NO subscription row of any status for (org, plan,
 *     mode) — a cancelled/expired row still means "has had one";
 *   - an unreadable store → no trial (checkout itself may still proceed).
 */

import { ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";

export const TRIAL_PERIOD_DAYS = 14 as const;

export type TrialHistory = "none" | "has_history" | "unreadable";

export type TrialDecision =
  | { trial: true; days: typeof TRIAL_PERIOD_DAYS }
  | {
      trial: false;
      reason:
        | "not_trial_plan"
        | "not_organization_subject"
        | "organization_has_subscription_history"
        | "history_unreadable";
    };

export function decideTrial(input: {
  planKey: string;
  subjectType: "organization" | "profile";
  history: TrialHistory;
}): TrialDecision {
  if (input.planKey !== ORGANIZATION_PLAN_KEY) return { trial: false, reason: "not_trial_plan" };
  if (input.subjectType !== "organization") {
    return { trial: false, reason: "not_organization_subject" };
  }
  if (input.history === "unreadable") return { trial: false, reason: "history_unreadable" };
  if (input.history === "has_history") {
    return { trial: false, reason: "organization_has_subscription_history" };
  }
  return { trial: true, days: TRIAL_PERIOD_DAYS };
}

/**
 * The sentence Stripe Checkout shows above the pay button (`custom_text.submit`).
 * The figure is read from the Stripe price itself, never typed here, so the
 * text can never disagree with what is charged. Stripe caps the message at 500
 * characters; this one is well under.
 */
export function trialConsentText(input: {
  days: number;
  unitAmountCents: number;
  currency: string;
  interval: string | null;
}): string {
  const amount = new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: input.currency.toUpperCase(),
    minimumFractionDigits: input.unitAmountCents % 100 === 0 ? 0 : 2,
  }).format(input.unitAmountCents / 100);
  const per = input.interval ? `/${input.interval}` : "";
  return (
    `Free for ${input.days} days. After the trial your card is charged ${amount}${per} ` +
    `(excl. VAT) until you cancel. Cancel any time before the trial ends in your ` +
    `organization account and you pay nothing.`
  );
}
