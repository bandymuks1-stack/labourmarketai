"use client";

import { useActionState, useRef } from "react";

import {
  setCompanyVerificationAction,
  type CompanyVerificationActionState,
} from "@/lib/admin/company-verification-actions";
import type { AdminVerificationStatus } from "@/lib/admin/company-verification";

/**
 * Per-row admin review controls for one company verification request.
 *
 * Three explicit, boring actions — Approve (verified), Keep unverified, Return
 * to pending — plus an optional note. No fake trust badge, no auto-verify.
 *
 * The chosen action is carried to the server through a hidden `status` field
 * set on click: in React 19 a submit button's name/value is NOT delivered to a
 * function `formAction`, so a hidden input is the reliable channel (same fix as
 * the company setup form).
 */
export interface CompanyVerificationReviewLabels {
  readonly approve: string;
  readonly keepUnverified: string;
  readonly returnToPending: string;
  readonly noteLabel: string;
  readonly notePlaceholder: string;
  readonly statusSaved: string;
  readonly statusNotAdmin: string;
  readonly statusInvalid: string;
  readonly statusNotFound: string;
  readonly statusNeedsMigration: string;
  readonly statusError: string;
  readonly saving: string;
}

export function CompanyVerificationReview({
  companyId,
  defaultNote,
  labels,
}: {
  readonly companyId: string;
  readonly defaultNote: string | null;
  readonly labels: CompanyVerificationReviewLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    CompanyVerificationActionState | null,
    FormData
  >(setCompanyVerificationAction, null);

  const statusRef = useRef<HTMLInputElement>(null);
  const setStatus = (v: AdminVerificationStatus) => {
    if (statusRef.current) statusRef.current.value = v;
  };

  const banner: { tone: "success" | "warning"; text: string } | null = (() => {
    if (!state) return null;
    if (state.ok) return { tone: "success", text: labels.statusSaved };
    switch (state.code) {
      case "not_admin":
        return { tone: "warning", text: labels.statusNotAdmin };
      case "invalid":
        return { tone: "warning", text: labels.statusInvalid };
      case "not_found":
        return { tone: "warning", text: labels.statusNotFound };
      case "needs_migration":
        return { tone: "warning", text: labels.statusNeedsMigration };
      default:
        return { tone: "warning", text: state.message ?? labels.statusError };
    }
  })();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      data-testid={`company-verification-review-${companyId}`}
    >
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="status" ref={statusRef} defaultValue="" />

      <label className="flex flex-col gap-1 text-meta">
        <span className="text-text-muted">{labels.noteLabel}</span>
        <textarea
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={defaultNote ?? ""}
          placeholder={labels.notePlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-xs text-text-primary outline-none focus:border-brand-blue"
          data-testid={`company-verification-note-${companyId}`}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          onClick={() => setStatus("verified")}
          disabled={isPending}
          className="rounded-md bg-state-success/90 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-state-success disabled:opacity-50"
          data-testid={`company-verification-approve-${companyId}`}
        >
          {labels.approve}
        </button>
        <button
          type="submit"
          onClick={() => setStatus("unverified")}
          disabled={isPending}
          className="rounded-md border border-state-warning/50 px-3 py-1.5 text-xs font-semibold text-state-warning hover:border-state-warning disabled:opacity-50"
          data-testid={`company-verification-unverify-${companyId}`}
        >
          {labels.keepUnverified}
        </button>
        <button
          type="submit"
          onClick={() => setStatus("pending_verification")}
          disabled={isPending}
          className="rounded-md border border-border-default px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-blue disabled:opacity-50"
          data-testid={`company-verification-pending-${companyId}`}
        >
          {labels.returnToPending}
        </button>
      </div>

      {isPending ? (
        <p
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-meta text-text-muted"
          role="status"
          data-testid={`company-verification-saving-${companyId}`}
        >
          {labels.saving}
        </p>
      ) : banner ? (
        <p
          className={
            banner.tone === "success"
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-meta text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-meta text-state-warning"
          }
          role="status"
          data-testid={`company-verification-result-${companyId}`}
        >
          {banner.text}
        </p>
      ) : null}
    </form>
  );
}
