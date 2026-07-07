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
] as const;

export type CompanyNeedIntakeStatus =
  (typeof COMPANY_NEED_INTAKE_STATUSES)[number];
