/**
 * Account-deletion status + self-service cancel — the PURE model (owner P0
 * 2026-11-09: a person can cancel their own account-deletion request).
 *
 * The two database functions this reads
 * (`privacy_account_deletion_status_v1`, `privacy_cancel_account_deletion_v1`)
 * arrive in a separate RED migration. Until that migration is applied they do
 * not exist, and this model turns that into `unavailable`: the privacy page
 * then shows exactly what it showed before — no cancel button, no status, no
 * scheduled date. Any OTHER failure is `error`: an honest "could not load /
 * could not cancel, try again", never a fake success.
 *
 * Everything here is pure (no Supabase, no React) so the mapping is unit
 * tested in `deletion-cancel-model.test.ts`; the server calls live in
 * `deletion-cancel-actions.ts`.
 */

/** PostgREST/Postgres "the function is not there". */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

export interface RpcErrorLike {
  readonly code?: string | null;
  readonly message?: string | null;
}

/** True when the error means "this RPC does not exist (yet)". */
export function isMissingRpcError(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  if (error.code && MISSING_FUNCTION_CODES.has(error.code)) return true;
  return /could not find the function/i.test(error.message ?? "");
}

export type DeletionRequestStatus = "pending" | "withdrawn" | "in_progress" | "done";

const REQUEST_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "withdrawn",
  "in_progress",
  "done",
]);

export type DeletionStatusView =
  /** The status RPC is not deployed — keep today's page, add nothing. */
  | { readonly kind: "unavailable" }
  /** The status could not be read — say so; never guess. */
  | { readonly kind: "error" }
  /** The person has no account-deletion request. */
  | { readonly kind: "none" }
  | {
      readonly kind: "request";
      readonly status: DeletionRequestStatus;
      readonly requestId: string;
      readonly submittedAt: string | null;
      readonly deletionConfirmedAt: string | null;
      readonly scheduledErasureAt: string | null;
      /** Only ever true for a `pending` request (defensive: a withdrawn or
       *  started erasure never offers a cancel, whatever the payload says). */
      readonly cancellable: boolean;
    };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Turns the status RPC's `{ data, error }` into the one view the page reads. */
export function parseDeletionStatus(
  data: unknown,
  error: RpcErrorLike | null | undefined,
): DeletionStatusView {
  if (error) return isMissingRpcError(error) ? { kind: "unavailable" } : { kind: "error" };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { kind: "error" };
  const row = data as Record<string, unknown>;
  const status = row.status;
  if (status === "none") return { kind: "none" };
  if (typeof status !== "string" || !REQUEST_STATUSES.has(status)) return { kind: "error" };
  const requestId = str(row.request_id);
  if (!requestId) return { kind: "error" };
  const typed = status as DeletionRequestStatus;
  // `deletion_confirmed_at`: when the person confirmed the DELETION request —
  // nothing to do with e-mail verification.
  return {
    kind: "request",
    status: typed,
    requestId,
    submittedAt: str(row.submitted_at),
    deletionConfirmedAt: str(row.deletion_confirmed_at),
    scheduledErasureAt: str(row.scheduled_erasure_at),
    cancellable: typed === "pending" && row.cancellable === true,
  };
}

export type CancelDeletionResult =
  | { readonly kind: "cancelled"; readonly requestId: string | null }
  | { readonly kind: "already-cancelled"; readonly requestId: string | null }
  | { readonly kind: "not-cancellable"; readonly requestId: string | null }
  | { readonly kind: "not-found" }
  | { readonly kind: "not-signed-in" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "error" };

/** Turns the cancel RPC's `{ data, error }` into one outcome. */
export function parseCancelResult(
  data: unknown,
  error: RpcErrorLike | null | undefined,
): CancelDeletionResult {
  if (error) return isMissingRpcError(error) ? { kind: "unavailable" } : { kind: "error" };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { kind: "error" };
  const row = data as Record<string, unknown>;
  const requestId = str(row.request_id);
  switch (row.status) {
    case "ok":
      return { kind: "cancelled", requestId };
    case "ok_already":
      return { kind: "already-cancelled", requestId };
    case "not_cancellable":
      return { kind: "not-cancellable", requestId };
    case "not_found":
      return { kind: "not-found" };
    case "not_signed_in":
      return { kind: "not-signed-in" };
    default:
      return { kind: "error" };
  }
}

/** Keys under `privacySelfService.deletion.cancel` (all active locales). */
export type CancelMessageKey =
  | "cancelled"
  | "notCancellable"
  | "notFound"
  | "notSignedIn"
  | "unavailable"
  | "error";

export interface CancelOutcomeView {
  readonly messageKey: CancelMessageKey;
  readonly tone: "success" | "warning";
  /** The request is now withdrawn — the page refreshes to show it. */
  readonly withdrawn: boolean;
}

/** What the person is told after pressing cancel. `ok_already` reads the same
 *  as `ok`: either way the account stays active. */
export function cancelOutcomeView(result: CancelDeletionResult): CancelOutcomeView {
  switch (result.kind) {
    case "cancelled":
    case "already-cancelled":
      return { messageKey: "cancelled", tone: "success", withdrawn: true };
    case "not-cancellable":
      return { messageKey: "notCancellable", tone: "warning", withdrawn: false };
    case "not-found":
      return { messageKey: "notFound", tone: "warning", withdrawn: false };
    case "not-signed-in":
      return { messageKey: "notSignedIn", tone: "warning", withdrawn: false };
    case "unavailable":
      return { messageKey: "unavailable", tone: "warning", withdrawn: false };
    case "error":
      return { messageKey: "error", tone: "warning", withdrawn: false };
  }
}

/**
 * True only when the status RPC demonstrably ANSWERED (`none` or a request) —
 * i.e. the migration that introduces the 30-day waiting period is live. Then
 * (and only then) the page describes the wait. `unavailable` and `error`
 * prove nothing, so the existing, currently-true copy stays.
 */
export function deletionStatusProvesRpc(view: DeletionStatusView): boolean {
  return view.kind === "none" || view.kind === "request";
}

/** Keys under `privacySelfService.deletion.status`. */
export type DeletionStatusLabelKey = "pending" | "pendingConfirmed" | "withdrawn" | "inProgress" | "done";

export function deletionStatusLabelKey(
  view: Extract<DeletionStatusView, { kind: "request" }>,
): DeletionStatusLabelKey {
  switch (view.status) {
    case "pending":
      return view.deletionConfirmedAt ? "pendingConfirmed" : "pending";
    case "withdrawn":
      return "withdrawn";
    case "in_progress":
      return "inProgress";
    case "done":
      return "done";
  }
}

/** Which of the deletion section's existing controls renders. */
export type DeletionSectionMode = "request-form" | "confirm-step" | "in-review" | "status-only";

/**
 * The ONE rule for the deletion section. With no status (RPC absent, none, or
 * unreadable) it is exactly the rule the page used before this change: the
 * reviewed-request list decides. With a status it adds only what the status
 * proves: a withdrawn request lets the person file again, a confirmed or
 * started erasure does not show the confirm button a second time.
 */
export function deletionSectionMode(
  view: DeletionStatusView,
  openRequestStatus: string | null,
): DeletionSectionMode {
  const legacy: DeletionSectionMode =
    openRequestStatus === "needs_followup"
      ? "in-review"
      : openRequestStatus
        ? "confirm-step"
        : "request-form";
  if (view.kind !== "request") return legacy;
  switch (view.status) {
    case "withdrawn":
      return "request-form";
    case "in_progress":
    case "done":
      return "status-only";
    case "pending":
      if (openRequestStatus === "needs_followup") return "in-review";
      return view.deletionConfirmedAt ? "status-only" : "confirm-step";
  }
}
