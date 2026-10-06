import type { EmployerVisibility } from "@/lib/privacy/employer-visibility";
import type { PartnerSupplyState } from "@/lib/privacy/partner-supply-actions";

/**
 * The worker's next-step list on /dashboard/privacy when they arrive from the
 * inbound-worker campaign (`?activation=worker`).
 *
 * PURE and READ-ONLY. It restates what the person has ALREADY decided, from the
 * same readers the privacy screen uses; it grants nothing, prefills nothing and
 * never turns an unread value into a decision (SEP-7: UNKNOWN is not OFF).
 *
 * The steps are DOORS to the existing controls: the employer-visibility
 * consent, the partner-supply representation consent, the supply declaration
 * (shown by the representation component once the consent is answered) and the
 * profile page. No second editor, no second consent path.
 */
export type ActivationStepKey =
  | "visibility"
  | "representation"
  | "declaration"
  | "profile";

/** `unknown` = the read failed; `na` = a step with no recorded state. */
export type ActivationStepState = "done" | "open" | "unknown" | "na";

export interface ActivationStep {
  readonly key: ActivationStepKey;
  readonly href: string;
  readonly state: ActivationStepState;
  readonly optional: boolean;
}

export function deriveWorkerActivationSteps(input: {
  visibility: EmployerVisibility;
  partnerSupply: Pick<
    PartnerSupplyState,
    "kind" | "consentStatus" | "declaration"
  > | null;
}): ActivationStep[] {
  const ps = input.partnerSupply;
  const psOk = ps !== null && ps.kind === "ok";

  const visibility: ActivationStepState =
    input.visibility === "on" ? "done" : input.visibility === "off" ? "open" : "unknown";

  const representation: ActivationStepState = !psOk
    ? "unknown"
    : ps.consentStatus === "granted"
      ? "done"
      : "open";

  // A declaration counts only while it is live (not withdrawn) - the same
  // reading the feed applies, so "done" here never outruns "emitted" there.
  const declaration: ActivationStepState = !psOk
    ? "unknown"
    : ps.declaration !== null && ps.declaration.withdrawnAt === null
      ? "done"
      : "open";

  return [
    { key: "visibility", href: "#visibility", state: visibility, optional: false },
    { key: "representation", href: "#partner-supply", state: representation, optional: false },
    { key: "declaration", href: "#partner-supply", state: declaration, optional: false },
    { key: "profile", href: "/dashboard/profile", state: "na", optional: true },
  ];
}
