"use client";

import { useActionState } from "react";

import {
  createCohortAction,
  createProgramAction,
  setCohortMemberAction,
  type ProgramActionState,
} from "@/lib/education/program-actions";

const IDLE: ProgramActionState = { status: "idle" };

export type ProgramFormLabels = {
  readonly programName: string;
  readonly targetProfession: string;
  readonly noProfession: string;
  readonly educationType: string;
  readonly noType: string;
  readonly description: string;
  readonly createProgram: string;
  readonly cohortName: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly createCohort: string;
  readonly assignLearner: string;
  readonly chooseLearner: string;
  readonly assign: string;
  readonly remove: string;
  readonly saving: string;
  readonly saved: string;
  readonly forbidden: string;
  readonly invalid: string;
  readonly error: string;
};

const inputCls =
  "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
const btnCls =
  "inline-flex items-center rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-xs font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-60";

function StateLine({ state, labels }: { state: ProgramActionState; labels: ProgramFormLabels }) {
  if (state.status === "idle") return null;
  if (state.status === "ok") return <p className="text-xs text-text-secondary">{labels.saved}</p>;
  if (state.status === "forbidden") return <p className="text-xs text-state-danger" role="alert">{labels.forbidden}</p>;
  if (state.status === "invalid") return <p className="text-xs text-state-danger" role="alert">{labels.invalid}</p>;
  return <p className="text-xs text-state-danger" role="alert">{labels.error}</p>;
}

export function CreateProgramForm({
  organizationId,
  professions,
  educationTypes,
  labels,
}: {
  readonly organizationId: string;
  readonly professions: ReadonlyArray<{ slug: string; label: string }>;
  readonly educationTypes: ReadonlyArray<{ slug: string; label: string }>;
  readonly labels: ProgramFormLabels;
}) {
  const [state, action, pending] = useActionState(createProgramAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2" data-testid="create-program-form">
      <input type="hidden" name="organizationId" value={organizationId} readOnly />
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.programName}
        <input name="name" required minLength={2} maxLength={160} className={inputCls} data-testid="program-name" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.targetProfession}
        <select name="targetProfessionSlug" className={inputCls} data-testid="program-profession" defaultValue="">
          <option value="">{labels.noProfession}</option>
          {professions.map((p) => (
            <option key={p.slug} value={p.slug}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.educationType}
        <select name="educationTypeSlug" className={inputCls} defaultValue="">
          <option value="">{labels.noType}</option>
          {educationTypes.map((e) => (
            <option key={e.slug} value={e.slug}>{e.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.description}
        <textarea name="description" maxLength={2000} rows={2} className={inputCls} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnCls} data-testid="program-create">
          {pending ? labels.saving : labels.createProgram}
        </button>
        <StateLine state={state} labels={labels} />
      </div>
    </form>
  );
}

export function CreateCohortForm({ programId, labels }: { readonly programId: string; readonly labels: ProgramFormLabels }) {
  const [state, action, pending] = useActionState(createCohortAction, IDLE);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`create-cohort-form-${programId}`}>
      <input type="hidden" name="programId" value={programId} readOnly />
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
        {labels.cohortName}
        <input name="name" required minLength={1} maxLength={120} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.startsOn}
        <input name="startsOn" type="date" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {labels.endsOn}
        <input name="endsOn" type="date" className={inputCls} />
      </label>
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? labels.saving : labels.createCohort}
      </button>
      <StateLine state={state} labels={labels} />
    </form>
  );
}

export function AssignLearnerForm({
  cohortId,
  learners,
  labels,
}: {
  readonly cohortId: string;
  readonly learners: ReadonlyArray<{ profileId: string; label: string }>;
  readonly labels: ProgramFormLabels;
}) {
  const [state, action, pending] = useActionState(setCohortMemberAction, IDLE);
  if (learners.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid={`assign-learner-form-${cohortId}`}>
      <input type="hidden" name="cohortId" value={cohortId} readOnly />
      <input type="hidden" name="status" value="active" readOnly />
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-text-secondary">
        {labels.assignLearner}
        <select name="profileId" required className={inputCls} defaultValue="">
          <option value="" disabled>{labels.chooseLearner}</option>
          {learners.map((l) => (
            <option key={l.profileId} value={l.profileId}>{l.label}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? labels.saving : labels.assign}
      </button>
      <StateLine state={state} labels={labels} />
    </form>
  );
}

export function RemoveMemberButton({
  cohortId,
  profileId,
  labels,
}: {
  readonly cohortId: string;
  readonly profileId: string;
  readonly labels: ProgramFormLabels;
}) {
  const [, action, pending] = useActionState(setCohortMemberAction, IDLE);
  return (
    <form action={action}>
      <input type="hidden" name="cohortId" value={cohortId} readOnly />
      <input type="hidden" name="profileId" value={profileId} readOnly />
      <input type="hidden" name="status" value="left" readOnly />
      <button type="submit" disabled={pending} className="text-xs text-text-muted hover:text-text-secondary hover:underline">
        {labels.remove}
      </button>
    </form>
  );
}
