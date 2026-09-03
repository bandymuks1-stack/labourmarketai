"use client";

import { useFormStatus } from "react-dom";

import {
  cancelWorkPlanEntryAction,
  createWorkPlanEntryAction,
} from "@/lib/planning/work-plan-actions";
import { AUTH_INPUT_CLASS } from "@/components/app/auth-field-class";

/**
 * Plan a work window (FINAL COMPLETION Train F1) — a plain server-action form:
 * worker, dates, optional project / object / times / note. Validation runs in
 * the action (validateWorkPlanInput mirrors the database checks); the RPC is
 * the authority. Pending signal + role="status" per the form-submit contract.
 */
function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-10 items-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="work-plan-submit"
      >
        {pending ? pendingLabel : label}
      </button>
      {pending && (
        <span role="status" className="sr-only">
          {pendingLabel}
        </span>
      )}
    </>
  );
}

export function WorkPlanForm({
  locale,
  organizationId,
  workers,
  projects,
  workObjects,
  today,
  labels,
}: {
  locale: string;
  organizationId: string;
  workers: readonly { workerId: string; name: string }[];
  projects: readonly { id: string; title: string }[];
  workObjects: readonly { id: string; name: string }[];
  today: string;
  labels: {
    worker: string;
    project: string;
    workObject: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    note: string;
    submit: string;
    pending: string;
    none: string;
  };
}) {
  const field = "flex flex-col gap-1.5 text-xs text-text-secondary";
  return (
    <form
      action={createWorkPlanEntryAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      data-testid="work-plan-form"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="organization_id" value={organizationId} />
      <label className={field}>
        {labels.worker}
        <select name="worker_id" required className={AUTH_INPUT_CLASS} data-testid="work-plan-worker">
          {workers.map((w) => (
            <option key={w.workerId} value={w.workerId}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        {labels.project}
        <select name="project_id" className={AUTH_INPUT_CLASS} data-testid="work-plan-project">
          <option value="">{labels.none}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        {labels.startDate}
        <input type="date" name="start_date" required defaultValue={today} className={AUTH_INPUT_CLASS} data-testid="work-plan-start" />
      </label>
      <label className={field}>
        {labels.endDate}
        <input type="date" name="end_date" className={AUTH_INPUT_CLASS} data-testid="work-plan-end" />
      </label>
      <label className={field}>
        {labels.startTime}
        <input type="time" name="start_time" className={AUTH_INPUT_CLASS} />
      </label>
      <label className={field}>
        {labels.endTime}
        <input type="time" name="end_time" className={AUTH_INPUT_CLASS} />
      </label>
      {workObjects.length > 0 && (
        <label className={field}>
          {labels.workObject}
          <select name="work_object_id" className={AUTH_INPUT_CLASS}>
            <option value="">{labels.none}</option>
            {workObjects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`${field} sm:col-span-2`}>
        {labels.note}
        <input type="text" name="note" maxLength={500} className={AUTH_INPUT_CLASS} />
      </label>
      <div className="sm:col-span-2">
        <Submit label={labels.submit} pendingLabel={labels.pending} />
      </div>
    </form>
  );
}

export function WorkPlanCancelButton({
  locale,
  entryId,
  labels,
}: {
  locale: string;
  entryId: string;
  labels: { cancel: string; pending: string };
}) {
  return (
    <form action={cancelWorkPlanEntryAction} className="inline">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="entry_id" value={entryId} />
      <CancelSubmit label={labels.cancel} pendingLabel={labels.pending} />
    </form>
  );
}

function CancelSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-primary hover:border-state-danger/60 hover:text-state-danger disabled:opacity-60"
        data-testid="work-plan-cancel"
      >
        {pending ? pendingLabel : label}
      </button>
      {pending && (
        <span role="status" className="sr-only">
          {pendingLabel}
        </span>
      )}
    </>
  );
}
