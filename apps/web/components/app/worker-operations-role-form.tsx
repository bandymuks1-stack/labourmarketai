"use client";

import { useActionState } from "react";

import {
  ASSIGNABLE_OPERATIONS_ROLES,
  type AssignRoleActionState,
} from "@/lib/operations/assign-operations-role";

/**
 * Owner/admin-only operations role-select control for a single worker row.
 *
 * Wired to the company / agency `assign*WorkerRoleAction` server action
 * (passed in as `action`). Lets an owner set or clear `operations_role` +
 * `operations_title` — the allowed roles come straight from
 * ASSIGNABLE_OPERATIONS_ROLES (the same set the validator + RPC enforce).
 *
 * The journal-review toggle is rendered VISIBLY DISABLED and never submits a
 * value: review cannot be enabled from a label until the engagement-context
 * bridge ships. This component never sends a review-enable value; the RPC
 * would reject it anyway. No fake approval / AI / verification claims.
 */

export interface OperationsRoleControlLabels {
  readonly heading: string;
  readonly roleLabel: string;
  readonly none: string;
  readonly titleLabel: string;
  readonly titlePlaceholder: string;
  readonly save: string;
  readonly saving: string;
  readonly reviewToggleLabel: string;
  readonly reviewDisabledNote: string;
  readonly outcomeAssigned: string;
  readonly outcomeCleared: string;
  readonly outcomeNotOwner: string;
  readonly outcomeNotLinked: string;
  readonly outcomeInvalidRole: string;
  readonly outcomeReviewNotAllowed: string;
  readonly outcomeError: string;
  readonly outcomeNeedsMigration: string;
  /** Localized label per assignable role id (worker / foreman / …). */
  readonly roleOptionLabels: Record<string, string>;
}

type AssignAction = (
  prev: AssignRoleActionState | null,
  formData: FormData,
) => Promise<AssignRoleActionState>;

export function WorkerOperationsRoleForm({
  workerId,
  currentRole,
  currentTitle,
  action,
  labels,
}: {
  readonly workerId: string;
  readonly currentRole: string | null;
  readonly currentTitle: string | null;
  readonly action: AssignAction;
  readonly labels: OperationsRoleControlLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    AssignRoleActionState | null,
    FormData
  >(action, null);

  const outcomeMessage: { text: string; ok: boolean } | null = (() => {
    if (!state) return null;
    if (state.ok) {
      switch (state.outcome) {
        case "assigned":
          return { text: labels.outcomeAssigned, ok: true };
        case "cleared":
          return { text: labels.outcomeCleared, ok: true };
        case "not_owner":
          return { text: labels.outcomeNotOwner, ok: false };
        case "not_linked":
          return { text: labels.outcomeNotLinked, ok: false };
        case "invalid_role":
          return { text: labels.outcomeInvalidRole, ok: false };
        case "review_not_allowed":
          return { text: labels.outcomeReviewNotAllowed, ok: false };
      }
    }
    if (state.code === "needs_migration")
      return { text: labels.outcomeNeedsMigration, ok: false };
    return { text: state.message ?? labels.outcomeError, ok: false };
  })();

  const defaultRole =
    currentRole && (ASSIGNABLE_OPERATIONS_ROLES as readonly string[]).includes(currentRole)
      ? currentRole
      : "";

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-col gap-2 rounded-md border border-ink-700 bg-surface-1 p-2"
      data-testid={`worker-ops-role-form-${workerId}`}
    >
      <input type="hidden" name="workerId" value={workerId} />
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {labels.heading}
      </span>

      <label className="flex flex-col gap-0.5 text-[11px]">
        <span className="text-text-secondary">{labels.roleLabel}</span>
        <select
          name="operationsRole"
          defaultValue={defaultRole}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-text-primary outline-none focus:border-brand-blue"
          data-testid={`worker-ops-role-select-${workerId}`}
        >
          <option value="">{labels.none}</option>
          {ASSIGNABLE_OPERATIONS_ROLES.map((r) => (
            <option key={r} value={r}>
              {labels.roleOptionLabels[r] ?? r}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-0.5 text-[11px]">
        <span className="text-text-secondary">{labels.titleLabel}</span>
        <input
          type="text"
          name="operationsTitle"
          maxLength={120}
          defaultValue={currentTitle ?? ""}
          placeholder={labels.titlePlaceholder}
          className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-text-primary outline-none focus:border-brand-blue"
          data-testid={`worker-ops-title-input-${workerId}`}
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md bg-brand-blue px-3 py-1 text-[11px] font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
        data-testid={`worker-ops-save-${workerId}`}
      >
        {isPending ? labels.saving : labels.save}
      </button>

      {/* Review toggle — VISIBLY DISABLED. Never submits a value; review
          cannot be enabled from a label until the engagement-context bridge
          ships. */}
      <div className="mt-1 flex flex-col gap-0.5 border-t border-ink-700 pt-2">
        <label className="flex cursor-not-allowed items-center gap-2 text-[11px] text-text-muted">
          <input
            type="checkbox"
            checked={false}
            disabled
            readOnly
            aria-disabled="true"
            data-testid={`worker-ops-review-toggle-${workerId}`}
          />
          <span>{labels.reviewToggleLabel}</span>
        </label>
        <p
          className="text-[10px] leading-relaxed text-text-muted"
          data-testid={`worker-ops-review-disabled-note-${workerId}`}
        >
          {labels.reviewDisabledNote}
        </p>
      </div>

      {outcomeMessage ? (
        <p
          className={
            outcomeMessage.ok
              ? "rounded-md border border-state-success bg-state-success/10 px-2 py-1 text-[10px] text-state-success"
              : "rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-[10px] text-state-warning"
          }
          role="status"
          data-testid={`worker-ops-result-${workerId}`}
        >
          {outcomeMessage.text}
        </p>
      ) : null}
    </form>
  );
}
