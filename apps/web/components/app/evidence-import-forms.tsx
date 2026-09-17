"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { useRouter } from "@/lib/i18n/navigation";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";

/**
 * The interactive shells of the evidence-import workspace.
 *
 * They hold NO domain logic — every one of them posts to a server action that
 * calls `lib/organization-evidence/import-core.ts`, the same core an authorized
 * assistant reaches through the MCP capabilities. What lives here is only what
 * a browser needs: pending state, the refusal message, and moving the person to
 * the session they just opened.
 *
 * REFUSALS ARE NAMED, NEVER SWALLOWED. Every action returns a product-state
 * reason; the component renders the localized sentence for it and carries the
 * raw reason as `data-reason` so a test or a support conversation can tell
 * "not provisioned" from "not authorized" from "the read failed" without
 * exposing internals in the UI.
 */

const field =
  "w-full rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";
const labelText =
  "font-mono text-meta uppercase tracking-label text-text-muted";
const button =
  "rounded-md border border-brand-orange/50 bg-brand-orange/10 px-4 py-2 text-sm font-semibold text-brand-orange disabled:opacity-50";
const quietButton =
  "rounded-md border border-ink-500 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-text-secondary disabled:opacity-50";

export type Option = { readonly value: string; readonly label: string };

/** The one refusal renderer, shared by every form on the page. */
function Refusal({
  state,
  errors,
}: {
  state: EvidenceImportActionState | null;
  errors: Record<string, string>;
}) {
  // The live region is present from the first render, not conditionally
  // mounted: a role="alert" inserted at the same moment its text appears is
  // announced unreliably, which is the same silence this guards against.
  if (!state || state.kind !== "refused") {
    return (
      <p
        role="alert"
        className="sr-only"
        data-testid="evidence-import-refusal-idle"
      />
    );
  }
  const message = errors[state.reason] ?? errors.unavailable;
  return (
    <p
      role="alert"
      data-testid="evidence-import-refusal"
      data-reason={state.reason}
      className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
    >
      {message}
    </p>
  );
}

// ── step 1: the source ─────────────────────────────────────────────────────

export interface SourceFormLabels {
  /** File-first entry (owner contract 2026-09-16 P0-B). */
  readonly dropzone: string;
  readonly dropzoneHint: string;
  readonly chosen: string;
  readonly advanced: string;
  readonly auto: string;
  readonly readNow: string;
  readonly supplierRole: string;
  readonly supplierRoleHint: string;
  readonly sourceKind: string;
  readonly sourceLanguage: string;
  readonly filename: string;
  readonly reference: string;
  readonly referenceHint: string;
  readonly notes: string;
  readonly paste: string;
  readonly pasteHint: string;
  readonly file: string;
  readonly submit: string;
  readonly submitting: string;
  readonly errors: Record<string, string>;
}

export function EvidenceSourceForm({
  action,
  labels,
  supplierRoles,
  sourceKinds,
  languages,
  defaultLanguage,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: SourceFormLabels;
  supplierRoles: readonly Option[];
  sourceKinds: readonly Option[];
  languages: readonly Option[];
  defaultLanguage: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ name: string; kind: "xlsx" | "csv" } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, { kind: "idle" });

  // A staged source becomes a URL the person can bookmark, reload and share
  // with the colleague who has to resolve the names.
  useEffect(() => {
    if (state.kind === "ok" && state.sessionId) {
      router.replace(
        `/dashboard/company/history?evidenceSession=${state.sessionId}#evidence-import`,
      );
    }
  }, [state, router]);

  // FILE FIRST (owner entry contract 2026-09-16 P0-B). Choosing a file IS the
  // request: the form submits itself and the server inspects the file — type,
  // structure, people, sites, dates, hours, week/date contradictions — and
  // stages the interpretation. Nothing becomes evidence; the commit is a
  // separate, explicit act further down. Role, kind, language, reference and
  // notes are derived server-side from the file and the organization; the
  // advanced section below lets the person state them when the derivation
  // would be wrong.
  const kindOf = (name: string): "xlsx" | "csv" => (/\.(xlsx|xlsm)$/i.test(name) ? "xlsx" : "csv");
  const onFile = (file: File | null) => {
    if (!file) return;
    setChosen({ name: file.name, kind: kindOf(file.name) });
    formRef.current?.requestSubmit();
  };
  const kindLabel = (kind: "xlsx" | "csv") =>
    sourceKinds.find((o) => o.value === kind)?.label ?? kind;

  return (
    <form
      ref={formRef}
      action={submit}
      className="flex flex-col gap-4"
      data-testid="evidence-source-form"
    >
      {/* THE PRIMARY ACTION: one drop zone, one button, nothing to fill in. */}
      <label
        htmlFor="evidence-source-file"
        data-testid="evidence-dropzone"
        data-dragging={dragging ? "true" : "false"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0] ?? null;
          if (file && fileRef.current) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileRef.current.files = dt.files;
          }
          onFile(file);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-brand-cyan bg-brand-cyan/5" : "border-ink-500 bg-ink-900/40 hover:border-brand-blue"
        }`}
      >
        <span className="inline-flex min-h-11 items-center rounded-control border border-brand-blue/50 bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-brand-blue">
          {pending ? labels.submitting : labels.dropzone}
        </span>
        <span className="max-w-prose text-xs leading-relaxed text-text-secondary">
          {labels.dropzoneHint}
        </span>
        <input
          id="evidence-source-file"
          ref={fileRef}
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          data-testid="evidence-source-file"
          onChange={(e) => onFile(e.currentTarget.files?.[0] ?? null)}
        />
        {chosen && (
          <span className="text-xs text-text-primary" data-testid="evidence-chosen-file" data-kind={chosen.kind}>
            {labels.chosen}: {chosen.name} · {kindLabel(chosen.kind)}
          </span>
        )}
      </label>

      <Refusal state={state} errors={labels.errors} />

      {/* PROGRESSIVE DISCLOSURE: provenance the file cannot state, and the
          manual paste path. "automatiškai" means the server derives it. */}
      <details className="rounded-md border border-ink-600" data-testid="evidence-source-advanced">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-brand-blue hover:underline">
          {labels.advanced}
        </summary>
        <div className="flex flex-col gap-4 px-3 pb-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelText}>{labels.supplierRole}</span>
              <select name="supplier_role" className={field} defaultValue="">
                <option value="">{labels.auto}</option>
                {supplierRoles.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-xs leading-relaxed text-text-muted">
                {labels.supplierRoleHint}
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>{labels.sourceKind}</span>
              <select name="source_kind" className={field} defaultValue="">
                <option value="">{labels.auto}</option>
                {sourceKinds.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>{labels.sourceLanguage}</span>
              <select name="source_language" className={field} defaultValue="">
                <option value="">
                  {labels.auto} ({defaultLanguage.toUpperCase()})
                </option>
                {languages.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelText}>{labels.filename}</span>
              <input name="source_filename" className={field} maxLength={300} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelText}>{labels.reference}</span>
              <input name="source_reference" className={field} maxLength={500} />
              <span className="text-xs leading-relaxed text-text-muted">
                {labels.referenceHint}
              </span>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={labelText}>{labels.notes}</span>
              <input name="notes" className={field} maxLength={1000} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelText}>{labels.paste}</span>
            <textarea name="pasted" rows={6} className={`${field} font-mono text-xs`} />
            <span className="text-xs leading-relaxed text-text-muted">{labels.pasteHint}</span>
          </label>
          <div>
            <button type="submit" className={button} disabled={pending} data-testid="evidence-source-read">
              {pending ? labels.submitting : labels.readNow}
            </button>
          </div>
        </div>
      </details>
    </form>
  );
}

// ── step 2: settle one row ─────────────────────────────────────────────────

export interface RowResolveLabels {
  readonly choosePerson: string;
  readonly choosePlace: string;
  readonly save: string;
  readonly addPerson: string;
  readonly displayName: string;
  readonly externalRef: string;
  readonly relationship: string;
  readonly create: string;
  readonly unlinkedNote: string;
  readonly errors: Record<string, string>;
}

export function EvidenceRowResolve({
  resolveAction,
  createAction,
  labels,
  sessionId,
  rowId,
  suggestedName,
  people,
  places,
  relationships,
}: {
  resolveAction: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  createAction: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: RowResolveLabels;
  sessionId: string;
  rowId: string;
  suggestedName: string;
  /** The roster, or just this row's candidates when the match was ambiguous. */
  people: readonly Option[];
  places: readonly Option[];
  relationships: readonly Option[];
}) {
  const [resolveState, resolve, resolving] = useActionState<
    EvidenceImportActionState,
    FormData
  >(resolveAction, { kind: "idle" });
  const [createState, create, creating] = useActionState<
    EvidenceImportActionState,
    FormData
  >(createAction, { kind: "idle" });

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="evidence-row-resolve"
      data-row={rowId}
    >
      {(people.length > 0 || places.length > 0) && (
        <form action={resolve} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="row_id" value={rowId} />
          <input type="hidden" name="session_id" value={sessionId} />
          {people.length > 0 && (
            <label className="flex min-w-48 flex-col gap-1">
              <span className={labelText}>{labels.choosePerson}</span>
              <select name="person_id" className={field} defaultValue="">
                <option value="" />
                {people.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {places.length > 0 && (
            <label className="flex min-w-48 flex-col gap-1">
              <span className={labelText}>{labels.choosePlace}</span>
              <select name="work_object_id" className={field} defaultValue="">
                <option value="" />
                {places.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={quietButton} disabled={resolving}>
            {labels.save}
          </button>
        </form>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-text-secondary">
          {labels.addPerson}
        </summary>
        <form action={create} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="row_id" value={rowId} />
          <input type="hidden" name="session_id" value={sessionId} />
          <label className="flex min-w-48 flex-col gap-1">
            <span className={labelText}>{labels.displayName}</span>
            <input
              name="display_name"
              required
              maxLength={200}
              defaultValue={suggestedName}
              className={field}
            />
          </label>
          <label className="flex min-w-32 flex-col gap-1">
            <span className={labelText}>{labels.externalRef}</span>
            <input name="external_ref" maxLength={120} className={field} />
          </label>
          <label className="flex min-w-40 flex-col gap-1">
            <span className={labelText}>{labels.relationship}</span>
            <select
              name="relationship_kind"
              className={field}
              defaultValue="employee"
            >
              {relationships.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={quietButton} disabled={creating}>
            {labels.create}
          </button>
          <p className="w-full text-xs leading-relaxed text-text-muted">
            {labels.unlinkedNote}
          </p>
        </form>
      </details>

      <Refusal state={resolveState} errors={labels.errors} />
      <Refusal state={createState} errors={labels.errors} />
    </div>
  );
}

// ── step 3: commit ─────────────────────────────────────────────────────────

export interface CommitFormLabels {
  readonly evidenceState: string;
  readonly evidenceStateHint: string;
  readonly confirm: string;
  readonly confirmNone: string;
  readonly confirming: string;
  readonly readOnce: string;
  readonly written: string;
  readonly skipped: string;
  readonly notReady: string;
  readonly createdPeople: string;
  readonly createdObjects: string;
  /** The PLAN controls (IA 2026-09-16 §3 P0-2). */
  readonly createPeople: string;
  readonly createObjects: string;
  readonly relationship: string;
  readonly errors: Record<string, string>;
}

/** What the commit PLAN offers to create, so the form can show the two
 *  choices only when there is something to choose about. */
export interface CommitPlanSummary {
  readonly people: number;
  readonly objects: number;
  readonly relationships: readonly Option[];
  readonly suggestedRelationship: string;
}

/** `written:N:skipped:N:notReady:N[:createdPeople:N:createdObjects:N]` — the
 *  action's own note, read back rather than a number the UI invented. */
function commitCounts(note: string | undefined): Record<string, string> | null {
  if (!note?.startsWith("written:")) return null;
  const p = note.split(":");
  return {
    written: p[1] ?? "0",
    skipped: p[3] ?? "0",
    notReady: p[5] ?? "0",
    createdPeople: p[7] ?? "0",
    createdObjects: p[9] ?? "0",
  };
}

export function EvidenceCommitForm({
  action,
  labels,
  sessionId,
  confirmationToken,
  readyCount,
  evidenceStates,
  plan,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: CommitFormLabels;
  sessionId: string;
  /** Absent when this environment cannot sign approvals — the button is then
   *  not offered at all rather than offered and failing. */
  confirmationToken: string | null;
  readyCount: number;
  evidenceStates: readonly Option[];
  plan: CommitPlanSummary;
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, {
    kind: "idle",
  });
  const counts = state.kind === "ok" ? commitCounts(state.note) : null;
  const hasPlan = plan.people > 0 || plan.objects > 0;

  return (
    <form
      action={submit}
      className="flex flex-col gap-3"
      data-testid="evidence-commit-form"
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <input
        type="hidden"
        name="confirmation_token"
        value={confirmationToken ?? ""}
      />
      <label className="flex max-w-md flex-col gap-1">
        <span className={labelText}>{labels.evidenceState}</span>
        <select
          name="evidence_state"
          className={field}
          defaultValue="ORGANIZATION_REPORTED"
        >
          {evidenceStates.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs leading-relaxed text-text-muted">
          {labels.evidenceStateHint}
        </span>
      </label>
      {/* THE PLAN — checked by default: the system prepared what the source
          names; the human reviewed it above and may still switch either off,
          in which case those rows stay for review. Rendered only when there
          is something to create, so a source that matches fully asks nothing. */}
      {hasPlan && (
        <fieldset
          className="flex flex-col gap-2 rounded-md border border-ink-500 px-3 py-2"
          data-testid="evidence-commit-plan"
        >
          {plan.people > 0 && (
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                name="plan_people"
                value="1"
                defaultChecked
                data-testid="evidence-plan-create-people"
              />
              {labels.createPeople} ({plan.people})
            </label>
          )}
          {plan.people > 0 && (
            <label className="flex max-w-md flex-col gap-1">
              <span className={labelText}>{labels.relationship}</span>
              <select
                name="plan_relationship"
                className={field}
                defaultValue={plan.suggestedRelationship}
                data-testid="evidence-plan-relationship"
              >
                {plan.relationships.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {plan.objects > 0 && (
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                name="plan_objects"
                value="1"
                defaultChecked
                data-testid="evidence-plan-create-objects"
              />
              {labels.createObjects} ({plan.objects})
            </label>
          )}
        </fieldset>
      )}
      <p className="text-xs leading-relaxed text-text-secondary">
        {labels.readOnce}
      </p>
      <Refusal state={state} errors={labels.errors} />
      {counts && (
        <p
          role="status"
          data-testid="evidence-commit-result"
          className="rounded-md border border-state-success/40 bg-state-success/5 px-3 py-2 text-xs text-text-secondary"
        >
          {labels.written}: {counts.written} · {labels.skipped}:{" "}
          {counts.skipped} · {labels.notReady}: {counts.notReady}
          {counts.createdPeople !== "0" || counts.createdObjects !== "0"
            ? ` · ${labels.createdPeople}: ${counts.createdPeople} · ${labels.createdObjects}: ${counts.createdObjects}`
            : ""}
        </p>
      )}
      <div>
        <button
          type="submit"
          className={button}
          disabled={pending || readyCount === 0 || confirmationToken === null}
        >
          {readyCount === 0
            ? labels.confirmNone
            : pending
              ? labels.confirming
              : labels.confirm.replace("{count}", String(readyCount))}
        </button>
      </div>
    </form>
  );
}

// ── the rollback ───────────────────────────────────────────────────────────

export interface WithdrawFormLabels {
  readonly note: string;
  readonly button: string;
  readonly hint: string;
  readonly errors: Record<string, string>;
}

export function EvidenceWithdrawForm({
  action,
  labels,
  sessionId,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: WithdrawFormLabels;
  sessionId: string;
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, {
    kind: "idle",
  });
  return (
    <form
      action={submit}
      className="flex flex-col gap-2"
      data-testid="evidence-withdraw-form"
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex max-w-md flex-col gap-1">
        <span className={labelText}>{labels.note}</span>
        <input name="note" maxLength={1000} className={field} />
      </label>
      <p className="text-xs leading-relaxed text-text-muted">{labels.hint}</p>
      <Refusal state={state} errors={labels.errors} />
      <div>
        <button type="submit" className={quietButton} disabled={pending}>
          {labels.button}
        </button>
      </div>
    </form>
  );
}

// ── attestation ────────────────────────────────────────────────────────────

export interface AttestFormLabels {
  readonly attest: string;
  readonly attestRole: string;
  readonly attestNote: string;
  readonly errors: Record<string, string>;
}

export function EvidenceAttestForm({
  action,
  labels,
  recordId,
  sessionId,
  roles,
  defaultRole,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: AttestFormLabels;
  /** One record — or, when absent, EVERY live unattested record of the
   *  session (owner correction 2026-09-17): the same event per record, the
   *  same authority, one append. */
  recordId?: string;
  sessionId: string;
  roles: readonly Option[];
  defaultRole: string;
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, {
    kind: "idle",
  });
  return (
    <form
      action={submit}
      className="flex flex-wrap items-end gap-2"
      data-testid={recordId ? "evidence-attest-form" : "evidence-attest-session-form"}
    >
      {recordId && <input type="hidden" name="record_id" value={recordId} />}
      <input type="hidden" name="session_id" value={sessionId} />
      <label className="flex min-w-40 flex-col gap-1">
        <span className={labelText}>{labels.attestRole}</span>
        <select name="actor_role" className={field} defaultValue={defaultRole}>
          {roles.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-col gap-1">
        <span className={labelText}>{labels.attestNote}</span>
        <input name="note" maxLength={1000} className={field} />
      </label>
      <button type="submit" className={quietButton} disabled={pending}>
        {labels.attest}
      </button>
      <Refusal state={state} errors={labels.errors} />
    </form>
  );
}

// ── label-level place decision ─────────────────────────────────────────────

export interface LabelResolveLabels {
  readonly question: string;
  readonly useExisting: string;
  /** "Same place as" another one this file names. */
  readonly sameAs: string;
  readonly createNew: string;
  readonly notAPlace: string;
  readonly save: string;
  readonly errors: Record<string, string>;
}

/**
 * ONE question for ONE source spelling, applied to every row that names it
 * (owner command §7). The choices are exactly the real candidates, "create
 * it under this name", or "this is not a place". Nothing is written until
 * saved, and saving writes staging only.
 */
export function EvidenceLabelResolveForm({
  action,
  labels,
  sessionId,
  labelKey,
  sourceLabel,
  candidates,
  defaultChoice,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: LabelResolveLabels;
  sessionId: string;
  labelKey: string;
  sourceLabel: string;
  /** Existing objects (an id) and other places this file names (`alias:<name>`). */
  candidates: readonly Option[];
  defaultChoice?: string;
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, { kind: "idle" });
  return (
    <form
      action={submit}
      className="flex flex-col gap-2"
      data-testid="evidence-label-resolve"
      data-label-key={labelKey}
    >
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="label_key" value={labelKey} />
      <p className="text-sm text-text-primary">
        {labels.question}: <span className="font-semibold">“{sourceLabel}”</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select name="choice" className={field} defaultValue={defaultChoice ?? candidates[0]?.value ?? "create"} data-testid="evidence-label-choice">
          {candidates.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value.startsWith("alias:") ? labels.sameAs : labels.useExisting}: {c.label}
            </option>
          ))}
          <option value="create">{labels.createNew}</option>
          <option value="ignore">{labels.notAPlace}</option>
        </select>
        <button type="submit" className={quietButton} disabled={pending}>
          {labels.save}
        </button>
      </div>
      <Refusal state={state} errors={labels.errors} />
    </form>
  );
}

// ── what an hours figure means ─────────────────────────────────────────────

export interface TimeSemanticsLabels {
  readonly question: string;
  readonly kindLabel: string;
  readonly kinds: { readonly period_aggregate: string; readonly daily: string; readonly unknown: string };
  readonly remoteLabel: string;
  readonly remote: { readonly yes: string; readonly no: string; readonly unknown: string };
  readonly periodLabel: string;
  readonly periodHint: string;
  readonly from: string;
  readonly to: string;
  readonly save: string;
  readonly hint: string;
  readonly errors: Record<string, string>;
}

/**
 * A human says what a figure a day cannot hold MEANS (owner correction
 * 2026-09-16): a period aggregate — optionally remote, with the period only
 * if they know it — a day's hours after all, or unknown. The source figure
 * is never edited, and a period is never invented: the date fields are
 * optional and empty by default. Staging only.
 */
export function EvidenceTimeSemanticsForm({
  action,
  labels,
  sessionId,
  rowIds,
  suggestedKind,
  suggestedRemote,
}: {
  action: (
    prev: EvidenceImportActionState,
    form: FormData,
  ) => Promise<EvidenceImportActionState>;
  labels: TimeSemanticsLabels;
  sessionId: string;
  rowIds: readonly string[];
  suggestedKind: "period_aggregate" | "unknown";
  suggestedRemote: boolean | null;
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, { kind: "idle" });
  const [kind, setKind] = useState<string>(suggestedKind);
  return (
    <form
      action={submit}
      className="flex flex-col gap-2"
      data-testid="evidence-time-semantics-form"
      data-rows={rowIds.length}
    >
      <input type="hidden" name="session_id" value={sessionId} />
      {rowIds.map((id) => (
        <input key={id} type="hidden" name="row_id" value={id} />
      ))}
      <p className="text-sm text-text-primary">{labels.question}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelText}>{labels.kindLabel}</span>
          <select name="kind" className={field} value={kind} onChange={(e) => setKind(e.target.value)} data-testid="evidence-time-kind">
            <option value="period_aggregate">{labels.kinds.period_aggregate}</option>
            <option value="daily">{labels.kinds.daily}</option>
            <option value="unknown">{labels.kinds.unknown}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelText}>{labels.remoteLabel}</span>
          <select name="remote" className={field} defaultValue={suggestedRemote === true ? "yes" : "unknown"} data-testid="evidence-time-remote">
            <option value="yes">{labels.remote.yes}</option>
            <option value="no">{labels.remote.no}</option>
            <option value="unknown">{labels.remote.unknown}</option>
          </select>
        </label>
      </div>
      {kind === "period_aggregate" && (
        <fieldset className="flex flex-col gap-1">
          <legend className={labelText}>{labels.periodLabel}</legend>
          <p className="text-xs text-text-muted">{labels.periodHint}</p>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {labels.from}
              <input type="date" name="period_start" className={field} data-testid="evidence-time-period-start" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {labels.to}
              <input type="date" name="period_end" className={field} data-testid="evidence-time-period-end" />
            </label>
          </div>
        </fieldset>
      )}
      <p className="text-xs leading-relaxed text-text-muted">{labels.hint}</p>
      <Refusal state={state} errors={labels.errors} />
      <div>
        <button type="submit" className={quietButton} disabled={pending}>
          {labels.save}
        </button>
      </div>
    </form>
  );
}
