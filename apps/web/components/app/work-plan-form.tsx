"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelWorkPlanEntryAction,
  createWorkPlanEntryAction,
} from "@/lib/planning/work-plan-actions";
import { AUTH_INPUT_CLASS } from "@/components/app/auth-field-class";
import {
  ISO_WEEKDAYS,
  SHIFT_CYCLE_MAX_OFF,
  SHIFT_CYCLE_MAX_ON,
  type ShiftRepeatMode,
} from "@/lib/planning/shift-pattern";

/** Localized short weekday names, Monday first (ISO), from the platform —
 *  no copy to translate. 2024-01-01 was a Monday. */
function weekdayNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return ISO_WEEKDAYS.map((d) => fmt.format(new Date(Date.UTC(2024, 0, d))));
}

export type ShiftRepeatLabels = {
  legend: string;
  none: string;
  weekly: string;
  cycle: string;
  weekdays: string;
  cycleOn: string;
  cycleOff: string;
  cycleOffset: string;
  hint: string;
};

/**
 * CAL-8 — the repeat controls of the ONE plan form (a shift pattern is a
 * property of a work plan window, not a second form or a second store).
 * Rendered only when the shift-pattern column is provisioned; the server
 * validates everything again (`shiftPatternFromForm`) and the RPC is the
 * authority.
 */
function ShiftRepeatFields({ locale, labels }: { locale: string; labels: ShiftRepeatLabels }) {
  const [mode, setMode] = useState<ShiftRepeatMode>("none");
  const names = weekdayNames(locale);
  const field = "flex flex-col gap-1.5 text-xs text-text-secondary";
  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2" data-testid="work-plan-repeat">
      <legend className="text-xs text-text-secondary">{labels.legend}</legend>
      <div className="flex flex-wrap gap-4" role="radiogroup">
        {(["none", "weekly", "cycle"] as const).map((m) => (
          <label key={m} className="inline-flex min-h-10 items-center gap-2 text-sm text-text-primary">
            <input
              type="radio"
              name="repeat"
              value={m}
              checked={mode === m}
              onChange={() => setMode(m)}
              data-testid={`work-plan-repeat-${m}`}
            />
            {labels[m]}
          </label>
        ))}
      </div>
      {mode === "weekly" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs text-text-secondary">{labels.weekdays}</legend>
          <div className="flex flex-wrap gap-3">
            {ISO_WEEKDAYS.map((d, i) => (
              <label key={d} className="inline-flex min-h-10 items-center gap-1.5 text-sm text-text-primary">
                <input
                  type="checkbox"
                  name="weekday"
                  value={String(d)}
                  defaultChecked={d <= 5}
                  data-testid={`work-plan-weekday-${d}`}
                />
                {names[i]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {mode === "cycle" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={field}>
            {labels.cycleOn}
            <input
              type="number"
              name="cycle_on"
              min={1}
              max={SHIFT_CYCLE_MAX_ON}
              defaultValue={4}
              required
              className={AUTH_INPUT_CLASS}
              data-testid="work-plan-cycle-on"
            />
          </label>
          <label className={field}>
            {labels.cycleOff}
            <input
              type="number"
              name="cycle_off"
              min={1}
              max={SHIFT_CYCLE_MAX_OFF}
              defaultValue={2}
              required
              className={AUTH_INPUT_CLASS}
              data-testid="work-plan-cycle-off"
            />
          </label>
          <label className={field}>
            {labels.cycleOffset}
            <input
              type="number"
              name="cycle_offset"
              min={0}
              max={SHIFT_CYCLE_MAX_ON + SHIFT_CYCLE_MAX_OFF - 1}
              defaultValue={0}
              className={AUTH_INPUT_CLASS}
              data-testid="work-plan-cycle-offset"
            />
          </label>
        </div>
      )}
      {mode !== "none" && <p className="text-xs text-text-muted">{labels.hint}</p>}
    </fieldset>
  );
}

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
        className="inline-flex min-h-10 items-center rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-text-on-brand hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
  repeatLabels,
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
  /** CAL-8: present only when shift patterns are provisioned. */
  repeatLabels?: ShiftRepeatLabels | null;
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
      {repeatLabels && <ShiftRepeatFields locale={locale} labels={repeatLabels} />}
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
