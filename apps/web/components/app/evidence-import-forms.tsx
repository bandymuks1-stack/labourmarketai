"use client";

import { useActionState, useEffect } from "react";

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
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, { kind: "idle" });

  // A staged source becomes a URL the person can bookmark, reload and share
  // with the colleague who has to resolve the names.
  useEffect(() => {
    if (state.kind === "ok" && state.sessionId) {
      router.replace(
        `/dashboard/company?evidenceSession=${state.sessionId}#evidence-import`,
      );
    }
  }, [state, router]);

  return (
    <form
      action={submit}
      className="flex flex-col gap-4"
      data-testid="evidence-source-form"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelText}>{labels.supplierRole}</span>
          <select
            name="supplier_role"
            required
            className={field}
            defaultValue=""
          >
            <option value="" disabled />
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
          <select
            name="source_kind"
            required
            className={field}
            defaultValue="csv"
          >
            {sourceKinds.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelText}>{labels.sourceLanguage}</span>
          <select
            name="source_language"
            required
            className={field}
            defaultValue={defaultLanguage}
          >
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
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.paste}</span>
        <textarea
          name="pasted"
          rows={8}
          className={`${field} font-mono text-xs`}
        />
        <span className="text-xs leading-relaxed text-text-muted">
          {labels.pasteHint}
        </span>
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.file}</span>
        <input
          type="file"
          name="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelText}>{labels.notes}</span>
        <input name="notes" className={field} maxLength={1000} />
      </label>

      <Refusal state={state} errors={labels.errors} />
      <div>
        <button type="submit" className={button} disabled={pending}>
          {pending ? labels.submitting : labels.submit}
        </button>
      </div>
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
  readonly errors: Record<string, string>;
}

/** `written:N:skipped:N:notReady:N` — the action's own note, read back rather
 *  than a number the UI invented. */
function commitCounts(note: string | undefined): Record<string, string> | null {
  if (!note?.startsWith("written:")) return null;
  const p = note.split(":");
  return { written: p[1] ?? "0", skipped: p[3] ?? "0", notReady: p[5] ?? "0" };
}

export function EvidenceCommitForm({
  action,
  labels,
  sessionId,
  confirmationToken,
  readyCount,
  evidenceStates,
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
}) {
  const [state, submit, pending] = useActionState<
    EvidenceImportActionState,
    FormData
  >(action, {
    kind: "idle",
  });
  const counts = state.kind === "ok" ? commitCounts(state.note) : null;

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
  recordId: string;
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
      data-testid="evidence-attest-form"
    >
      <input type="hidden" name="record_id" value={recordId} />
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
