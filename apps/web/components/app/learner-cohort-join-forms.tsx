"use client";

import { useActionState } from "react";

import {
  requestCohortJoinAction,
  withdrawCohortJoinAction,
  type CohortJoinActionState,
} from "@/lib/education/cohort-join-actions";

const IDLE: CohortJoinActionState = { status: "idle" };

export type CohortJoinLabels = {
  readonly nameLabel: string;
  readonly nameHint: string;
  readonly noteLabel: string;
  readonly send: string;
  readonly withdraw: string;
  readonly saving: string;
  readonly requested: string;
  readonly alreadyMember: string;
  readonly withdrawn: string;
  readonly closed: string;
  readonly invalid: string;
  readonly error: string;
};

const inputCls =
  "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
const btnCls =
  "inline-flex items-center rounded-md bg-gradient-cta px-3 py-1.5 text-xs font-semibold text-text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60";

function StateLine({ state, labels }: { state: CohortJoinActionState; labels: CohortJoinLabels }) {
  if (state.status === "idle") return null;
  const ok = state.status === "requested" || state.status === "already_member" || state.status === "withdrawn";
  const text =
    state.status === "requested"
      ? labels.requested
      : state.status === "already_member"
        ? labels.alreadyMember
        : state.status === "withdrawn"
          ? labels.withdrawn
          : state.status === "closed"
            ? labels.closed
            : state.status === "invalid"
              ? labels.invalid
              : labels.error;
  return (
    <p className={`text-xs ${ok ? "text-text-secondary" : "text-state-danger"}`} role={ok ? "status" : "alert"} data-testid="cohort-join-state">
      {text}
    </p>
  );
}

export function RequestCohortJoinForm({ cohortId, labels }: { readonly cohortId: string; readonly labels: CohortJoinLabels }) {
  const [state, action, pending] = useActionState(requestCohortJoinAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2" data-testid={`cohort-join-form-${cohortId}`}>
      <input type="hidden" name="cohortId" value={cohortId} readOnly />
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.nameLabel}
        <input name="label" required minLength={2} maxLength={120} className={inputCls} data-testid={`cohort-join-name-${cohortId}`} />
        <span className="text-meta text-text-muted">{labels.nameHint}</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.noteLabel}
        <textarea name="note" maxLength={500} rows={2} className={inputCls} data-testid={`cohort-join-note-${cohortId}`} />
      </label>
      <div>
        <button type="submit" disabled={pending} className={btnCls} data-testid={`cohort-join-send-${cohortId}`}>
          {pending ? labels.saving : labels.send}
        </button>
      </div>
      <StateLine state={state} labels={labels} />
    </form>
  );
}

export function WithdrawCohortJoinButton({ cohortId, labels }: { readonly cohortId: string; readonly labels: CohortJoinLabels }) {
  const [state, action, pending] = useActionState(withdrawCohortJoinAction, IDLE);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="cohortId" value={cohortId} readOnly />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-text-muted hover:text-text-secondary hover:underline disabled:opacity-60"
        data-testid={`cohort-join-withdraw-${cohortId}`}
      >
        {pending ? labels.saving : labels.withdraw}
      </button>
      <StateLine state={state} labels={labels} />
    </form>
  );
}
