"use client";

import { useActionState, useRef } from "react";

import {
  setCompanyNeedIntakeStatusAction,
  type CompanyNeedIntakeActionState,
} from "@/lib/admin/company-need-intake-actions";
import {
  COMPANY_NEED_INTAKE_OPERATOR_STATUSES,
  type CompanyNeedIntakeOperatorStatus,
  type CompanyNeedIntakeStatus,
} from "@/lib/admin/company-need-intake-shared";

/**
 * Per-row operator status control for one public company-need intake.
 *
 * Four explicit, boring actions — New / Contacted / Qualified / Rejected. The
 * chosen status is carried through a hidden field set on click: in React 19 a
 * submit button's name/value is NOT delivered to a function `formAction`, so a
 * hidden input is the reliable channel (same fix as company-verification-review).
 */
export interface CompanyNeedIntakeStatusLabels {
  /** Operator-settable actions only — `converted` is display-only (written
   *  by the company's own claim action, never by hand). */
  readonly actions: Record<CompanyNeedIntakeOperatorStatus, string>;
  readonly statusSaved: string;
  readonly statusNotAdmin: string;
  readonly statusInvalid: string;
  readonly statusNotFound: string;
  readonly statusNeedsMigration: string;
  readonly statusError: string;
}

const BUTTON_TONE: Record<CompanyNeedIntakeOperatorStatus, string> = {
  new: "border-brand-blue/50 text-brand-blue hover:border-brand-blue",
  contacted: "border-brand-blue/50 text-brand-blue hover:border-brand-blue",
  qualified:
    "border-state-success/50 text-state-success hover:border-state-success",
  rejected:
    "border-state-warning/50 text-state-warning hover:border-state-warning",
};

export function CompanyNeedIntakeStatusControl({
  intakeId,
  current,
  labels,
}: {
  readonly intakeId: string;
  readonly current: CompanyNeedIntakeStatus;
  readonly labels: CompanyNeedIntakeStatusLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    CompanyNeedIntakeActionState | null,
    FormData
  >(setCompanyNeedIntakeStatusAction, null);

  const statusRef = useRef<HTMLInputElement>(null);
  const setStatus = (v: CompanyNeedIntakeOperatorStatus) => {
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
      data-testid={`company-need-intake-status-${intakeId}`}
    >
      <input type="hidden" name="intake_id" value={intakeId} />
      <input type="hidden" name="status" ref={statusRef} defaultValue="" />

      <div className="flex flex-wrap gap-2">
        {COMPANY_NEED_INTAKE_OPERATOR_STATUSES.map((s) => (
          <button
            key={s}
            type="submit"
            onClick={() => setStatus(s)}
            disabled={isPending || s === current}
            aria-current={s === current ? "true" : undefined}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${BUTTON_TONE[s]} ${
              s === current ? "bg-ink-700/40" : ""
            }`}
            data-testid={`company-need-intake-set-${s}-${intakeId}`}
          >
            {labels.actions[s]}
          </button>
        ))}
      </div>

      {banner ? (
        <p
          className={
            banner.tone === "success"
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-[11px] text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-[11px] text-state-warning"
          }
          role="status"
          data-testid={`company-need-intake-result-${intakeId}`}
        >
          {banner.text}
        </p>
      ) : null}
    </form>
  );
}
