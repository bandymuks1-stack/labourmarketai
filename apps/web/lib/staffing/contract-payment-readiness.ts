/**
 * Contract / payment readiness (Staffing Operating Model v1, PR9).
 *
 * Deterministic checklist of what is still missing before a manual contract /
 * (future, owner-gated) paid path can begin, after a booking. It NEVER turns on
 * live payments, NEVER generates a final legal contract, and NEVER says
 * "contract guaranteed". `paymentsLive` is the literal `false`. It reuses the
 * existing billing config state (disabled / test-mode / live-blocked) so the
 * payment item is always honestly "not live".
 *
 * Pure. No IO.
 */
import type { BillingProviderState } from "../billing/config-core";

export type ReadinessItemStatus = "ready" | "missing" | "blocked";

export interface ContractReadinessItem {
  readonly key: "fit" | "documents" | "company_readiness" | "admin_review" | "payment";
  readonly status: ReadinessItemStatus;
  readonly detail: string;
}

export type ContractNextStep =
  | "resolve_fit_blockers"
  | "complete_documents"
  | "admin_review_needed"
  | "ready_for_manual_contract";

export interface ContractReadinessInput {
  readonly fitBlockers: readonly string[];
  readonly missingDocuments: readonly string[];
  readonly companyReadinessBlockers: readonly string[];
  readonly adminReviewDone: boolean;
  readonly billingState: BillingProviderState;
}

export interface ContractPaymentReadiness {
  readonly items: readonly ContractReadinessItem[];
  readonly nextStep: ContractNextStep;
  /** ALWAYS false this sprint — live payments are off by design. */
  readonly paymentsLive: false;
  readonly billingState: BillingProviderState;
  readonly summary: string;
}

function paymentDetail(state: BillingProviderState): string {
  switch (state) {
    case "stripe_test":
      return "billing is in TEST mode only — live payments are off";
    case "stripe_live_blocked":
      return "live billing is hard-blocked — payments are off";
    default:
      return "payments are disabled — not live";
  }
}

export function computeContractPaymentReadiness(
  input: ContractReadinessInput,
): ContractPaymentReadiness {
  const items: ContractReadinessItem[] = [
    {
      key: "fit",
      status: input.fitBlockers.length ? "blocked" : "ready",
      detail: input.fitBlockers.length
        ? input.fitBlockers.join("; ")
        : "no fit blockers",
    },
    {
      key: "documents",
      status: input.missingDocuments.length ? "missing" : "ready",
      detail: input.missingDocuments.length
        ? "missing: " + input.missingDocuments.join(", ")
        : "no missing documents recorded",
    },
    {
      key: "company_readiness",
      status: input.companyReadinessBlockers.length ? "blocked" : "ready",
      detail: input.companyReadinessBlockers.length
        ? input.companyReadinessBlockers.join("; ")
        : "no company readiness blockers",
    },
    {
      key: "admin_review",
      status: input.adminReviewDone ? "ready" : "missing",
      detail: input.adminReviewDone ? "admin review complete" : "admin review needed",
    },
    {
      // Payment is ALWAYS blocked this sprint — never live.
      key: "payment",
      status: "blocked",
      detail: paymentDetail(input.billingState),
    },
  ];

  let nextStep: ContractNextStep;
  if (input.fitBlockers.length) nextStep = "resolve_fit_blockers";
  else if (input.missingDocuments.length) nextStep = "complete_documents";
  else if (input.companyReadinessBlockers.length || !input.adminReviewDone)
    nextStep = "admin_review_needed";
  else nextStep = "ready_for_manual_contract";

  const summary =
    nextStep === "ready_for_manual_contract"
      ? "Ready for a manual contract step. Payment is not live (test mode / disabled)."
      : "Not yet ready — resolve the open items. Payment is not live regardless.";

  return { items, nextStep, paymentsLive: false, billingState: input.billingState, summary };
}
