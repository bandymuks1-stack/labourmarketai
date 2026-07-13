/**
 * Public Intake Owner Queue v1 — shared status values.
 *
 * The closed operator status set, split out with NO `server-only` guard so it
 * can be imported by BOTH the server data layer (company-need-intakes.ts) and
 * the client status control (company-need-intake-status.tsx) without pulling
 * server-only code into the client bundle.
 */
export const COMPANY_NEED_INTAKE_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "rejected",
  // Canonical-journey P3: the intake was claimed by the company itself
  // (email-verified account) and continued as a real draft demand — the
  // public intake is no longer a dead end. Set ONLY by the claim bridge
  // (lib/company/claim-public-intake.ts), shown read-only in the queue.
  "converted",
] as const;

export type CompanyNeedIntakeStatus =
  (typeof COMPANY_NEED_INTAKE_STATUSES)[number];

/** The statuses an OPERATOR may set by hand in the queue. `converted` is
 *  excluded — it is written only by the company's own claim action, so the
 *  operator can never claim a conversion that did not happen. */
export const COMPANY_NEED_INTAKE_OPERATOR_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "rejected",
] as const;

export type CompanyNeedIntakeOperatorStatus =
  (typeof COMPANY_NEED_INTAKE_OPERATOR_STATUSES)[number];
