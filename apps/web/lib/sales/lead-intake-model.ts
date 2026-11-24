/**
 * Pure sales/lead-intake model (product-tree branch 23, train §8.14) —
 * shared by the server read service and the client intake panel. No
 * server-only imports.
 *
 * READ-ONLY by doctrine: this layer surfaces EXISTING intake rows
 * (`leads` from the dormant /api/leads funnel, `waitlist` signups,
 * `customer_requests` in their operator-review states) to the superadmin
 * operator. It never claims CRM outcomes it cannot prove — stored status
 * values are shown verbatim as recorded data, and nothing in this layer
 * contacts anyone.
 */

/** Operator-review states of customer_requests (0028 status enum subset). */
export const INTAKE_REQUEST_STATUSES = [
  "submitted",
  "in_review",
  "needs_followup",
] as const;
export type IntakeRequestStatus = (typeof INTAKE_REQUEST_STATUSES)[number];

export type IntakeLeadRow = {
  readonly id: string;
  readonly source: string | null;
  /** Visible to the superadmin operator only (the point of an intake panel). */
  readonly email: string | null;
  readonly fullName: string | null;
  readonly companyName: string | null;
  readonly country: string | null;
  readonly intent: string | null;
  /** Stored pipeline value shown verbatim — recorded data, not a claim. */
  readonly status: string | null;
  readonly createdAt: string;
};

export type IntakeWaitlistRow = {
  readonly id: string;
  /** Visible to the superadmin operator only. */
  readonly email: string;
  readonly source: string;
  readonly locale: string | null;
  readonly createdAt: string;
};

export type IntakeRequestRow = {
  readonly id: string;
  readonly title: string;
  readonly status: IntakeRequestStatus;
  /** Id-only pointer — links to the EXISTING admin user-inspect page. */
  readonly profileId: string;
  readonly roleOrWorkType: string | null;
  readonly country: string | null;
  readonly createdAt: string;
};

/**
 * Honest per-source availability. `readable: false` is a real state, not a
 * failure to hide:
 *   - "needs_admin_read"   — the table exists but the app has no admin read
 *                            path for it yet (or the relation/grant is
 *                            missing: 42P01 / 42501 probe);
 *   - "service_key_missing" — the read requires the service-role key and it
 *                            is not configured in this environment;
 *   - "error"              — the read failed for another reason.
 */
export type IntakeSection<Row> =
  | {
      readonly readable: false;
      readonly reason: "needs_admin_read" | "service_key_missing" | "error";
    }
  | { readonly readable: true; readonly rows: readonly Row[] };

/** WAGON 10 — a typed internal help request (customer_requests row with
 *  payload.help_type, created only by submit_help_request_v1). Id-only
 *  subject pointer + the closed help type; the note is the row's own
 *  need_summary (author-provided, shown only on the superadmin panel). */
export type IntakeHelpRequestRow = {
  readonly id: string;
  readonly helpType: string;
  readonly status: IntakeRequestStatus;
  readonly profileId: string;
  readonly note: string | null;
  readonly demandRequestId: string | null;
  readonly createdAt: string;
};

export type LeadIntakeOverview = {
  readonly leads: IntakeSection<IntakeLeadRow>;
  readonly waitlist: IntakeSection<IntakeWaitlistRow>;
  readonly requests: IntakeSection<IntakeRequestRow>;
  readonly helpRequests: IntakeSection<IntakeHelpRequestRow>;
};

export type IntakeKind = "lead" | "waitlist" | "request" | "help_request";

/**
 * Deterministic note for the EXISTING §8.13 follow-up queue (its existing
 * create action is reused by the panel — never duplicated).
 * PII boundary: the note carries ONLY the intake kind, an
 * id prefix and a non-PII reference (source or title) — never an email,
 * name or phone. The follow-up row stays id-pointer + note, per the
 * §8.13 no-copied-PII doctrine.
 */
export function buildIntakeFollowUpNote(
  kind: IntakeKind,
  id: string,
  reference: string | null,
): string {
  const ref = (reference ?? "").trim().slice(0, 120);
  const base = `Sales intake ${kind} ${id.slice(0, 8)}`;
  return (ref ? `${base} (${ref})` : base).slice(0, 500);
}
