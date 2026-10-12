"use client";

import { useActionState, useState } from "react";

import { recordRecognitionAction } from "@/lib/education/recognition-actions";
import type { EvidenceBySubject } from "@/lib/education/recognition-evidence-model";
import type { RecognitionActionState } from "@/lib/education/recognition-model";

const IDLE: RecognitionActionState = { status: "idle" };

export type RecognitionFormLabels = {
  readonly title: string;
  readonly hint: string;
  readonly subject: string;
  readonly chooseSubject: string;
  readonly kind: string;
  readonly kindDocument: string;
  readonly kindSkill: string;
  readonly kindProfession: string;
  readonly key: string;
  readonly country: string;
  readonly evidence: string;
  readonly evidenceHint: string;
  readonly evidenceChooseLearner: string;
  readonly evidenceNone: string;
  readonly evidenceUnavailable: string;
  readonly evidenceRecorded: string;
  readonly evidenceConfirmed: string;
  readonly decision: string;
  readonly recognised: string;
  readonly notRecognised: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly note: string;
  readonly submit: string;
  readonly saving: string;
  readonly ok: string;
  readonly needsMigration: string;
  readonly forbidden: string;
  readonly invalid: string;
  readonly error: string;
};

const inputCls =
  "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
const btnCls =
  "inline-flex items-center rounded-md bg-gradient-cta px-3 py-1.5 text-xs font-semibold text-text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60";

function Outcome({ state, labels }: { state: RecognitionActionState; labels: RecognitionFormLabels }) {
  switch (state.status) {
    case "idle":
      return null;
    case "ok":
      return <p className="text-xs text-text-secondary" data-testid="recognition-ok">{labels.ok}</p>;
    case "needs_migration":
      return <p className="text-xs text-state-warning" role="alert" data-testid="recognition-needs-migration">{labels.needsMigration}</p>;
    case "forbidden":
      return <p className="text-xs text-state-danger" role="alert">{labels.forbidden}</p>;
    case "invalid":
      return <p className="text-xs text-state-danger" role="alert">{labels.invalid}</p>;
    default:
      return <p className="text-xs text-state-danger" role="alert">{labels.error}</p>;
  }
}

/**
 * SKL-9 assessor form. Shows, before anything is submitted, that the register
 * behind it is not switched on: a submission is refused with an explicit
 * `needs_migration` outcome, never reported as saved.
 */
export function RecordRecognitionForm({
  organizationId,
  learners,
  evidence,
  labels,
}: {
  readonly organizationId: string;
  readonly learners: ReadonlyArray<{ profileId: string; label: string }>;
  /** Citable entries per learner; `null` when they could not be read. */
  readonly evidence: EvidenceBySubject | null;
  readonly labels: RecognitionFormLabels;
}) {
  const [state, action, pending] = useActionState(recordRecognitionAction, IDLE);
  const [subject, setSubject] = useState("");
  // Picks belong to one learner: changing the learner clears them, so an entry
  // of person A can never ride along on a decision about person B.
  const [picked, setPicked] = useState<readonly string[]>([]);
  if (learners.length === 0) return null;
  const options = subject && evidence ? (evidence[subject] ?? []) : [];
  const togglePick = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <details className="rounded-md border border-ink-600 p-3" data-testid="record-recognition">
      <summary className="cursor-pointer text-xs font-semibold text-text-primary">{labels.title}</summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <p className="text-xs leading-relaxed text-text-secondary">{labels.hint}</p>
        <input type="hidden" name="assessorOrganizationId" value={organizationId} readOnly />
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.subject}
          <select
            name="subjectProfileId"
            required
            className={inputCls}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setPicked([]);
            }}
          >
            <option value="" disabled>{labels.chooseSubject}</option>
            {learners.map((l) => (
              <option key={l.profileId} value={l.profileId}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.kind}
          <select name="requirementKind" required className={inputCls} defaultValue="document_type">
            <option value="document_type">{labels.kindDocument}</option>
            <option value="skill">{labels.kindSkill}</option>
            <option value="profession">{labels.kindProfession}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.key}
          <input name="requirementKey" required maxLength={80} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.country}
          <input name="requirementCountry" required minLength={2} maxLength={2} className={inputCls} defaultValue="LT" />
        </label>
        <fieldset className="flex flex-col gap-1 text-xs text-text-secondary" data-testid="recognition-evidence">
          <legend className="mb-1">{labels.evidence}</legend>
          <span className="text-meta text-text-muted">{labels.evidenceHint}</span>
          {/* The ids the RPC needs travel as one hidden value; nobody types a uuid. */}
          <input type="hidden" name="evidenceEntryIds" value={picked.join(",")} readOnly />
          {!subject ? (
            <p className="text-meta text-text-muted">{labels.evidenceChooseLearner}</p>
          ) : evidence === null ? (
            <p className="text-meta text-state-warning" role="alert">{labels.evidenceUnavailable}</p>
          ) : options.length === 0 ? (
            <p className="text-meta text-text-muted" data-testid="recognition-evidence-none">{labels.evidenceNone}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {options.map((o) => (
                <li key={o.entryId}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(o.entryId)}
                      onChange={() => togglePick(o.entryId)}
                      className="mt-0.5"
                      data-testid="recognition-evidence-option"
                    />
                    <span className="flex flex-col">
                      <span className="text-text-primary">{o.excerpt || o.entryType}</span>
                      <span className="text-meta text-text-muted">
                        {labels.evidenceRecorded} {o.recordedOn} · {labels.evidenceConfirmed} {o.confirmedOn}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.decision}
          <select name="decision" required className={inputCls} defaultValue="recognised">
            <option value="recognised">{labels.recognised}</option>
            <option value="not_recognised">{labels.notRecognised}</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {labels.validFrom}
            <input name="validFrom" type="date" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {labels.validUntil}
            <input name="validUntil" type="date" className={inputCls} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {labels.note}
          <textarea name="note" rows={2} maxLength={2000} className={inputCls} />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending || picked.length === 0} className={btnCls}>
            {pending ? labels.saving : labels.submit}
          </button>
          <Outcome state={state} labels={labels} />
        </div>
      </form>
    </details>
  );
}
