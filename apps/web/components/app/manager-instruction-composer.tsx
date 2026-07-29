"use client";

import { useActionState, useState } from "react";

import {
  sendWorkInstructionAction,
  type InstructionActionResult,
} from "@/lib/instructions/actions";
import type { ManagedWorker } from "@/lib/instructions/instructions";
import type { ManagedProject } from "@/lib/projects/projects";

/**
 * Manager/foreman "Nurodymas darbuotojui" composer (slice work-instructions-v1).
 *
 * Writes an instruction in the manager's OWN language to a worker they manage.
 * The send goes through the relationship-gated SECURITY DEFINER RPC — an
 * unrelated worker cannot be instructed (the server returns not_authorized).
 * No fake translation, delivery, or read state.
 */

export interface ComposerLabels {
  workerLabel: string;
  workerPlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  languageNote: string;
  send: string;
  sending: string;
  sent: string;
  notAuthorized: string;
  needsMigration: string;
  errorMsg: string;
  /** Friendly localized "pick a worker first" message — replaces the
   *  browser-default "Please select an item in the list" popup. */
  selectWorkerError: string;
  noWorkers: string;
  scopeNote: string;
  projectScopeLabel: string;
  teamLevelOption: string;
}

export function ManagerInstructionComposer({
  workers,
  projects,
  defaultLanguage,
  labels,
}: {
  workers: ManagedWorker[];
  /** Projects the manager can manage — for optional project-scoped instructions (F5). */
  projects: ManagedProject[];
  /** The manager's current UI locale — stored as the instruction's original language. */
  defaultLanguage: string;
  labels: ComposerLabels;
}) {
  const [state, action, pending] = useActionState<
    InstructionActionResult | null,
    FormData
  >(sendWorkInstructionAction, null);

  // CONTROLLED worker selection (owner smoke fix): React 19 resets
  // uncontrolled fields after every form action, so the select could LOOK
  // chosen while its submitted value was empty — surfacing the browser's
  // native "Please select an item in the list" popup. Controlled state
  // survives re-renders, and validation shows a calm localized message.
  const [workerId, setWorkerId] = useState(
    workers.length === 1 ? workers[0].profileId : "",
  );
  const [selectError, setSelectError] = useState<string | null>(null);

  if (workers.length === 0) {
    return (
      <p className="card-border p-4 text-sm text-text-secondary" data-testid="composer-no-workers">
        {labels.noWorkers}
      </p>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // Custom validation instead of the native popup: if no worker is
        // chosen, stop the action and show the localized message inline.
        if (!workerId) {
          e.preventDefault();
          setSelectError(labels.selectWorkerError);
          return;
        }
        setSelectError(null);
      }}
      className="card-border flex flex-col gap-4 p-5"
      data-testid="manager-instruction-composer"
    >
      <input type="hidden" name="original_language" value={defaultLanguage} />

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.workerLabel}
        </span>
        <select
          name="worker_profile_id"
          value={workerId}
          onChange={(e) => {
            setWorkerId(e.target.value);
            if (e.target.value) setSelectError(null);
          }}
          data-testid="instruction-worker-select"
          className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
        >
          <option value="" disabled>
            {labels.workerPlaceholder}
          </option>
          {workers.map((w) => (
            <option key={w.profileId} value={w.profileId}>
              {w.name}
            </option>
          ))}
        </select>
        {selectError ? (
          <span
            className="text-xs text-state-danger"
            role="alert"
            data-testid="instruction-worker-select-error"
          >
            {selectError}
          </span>
        ) : null}
      </label>

      {/* F5 — optional project scope. "" = team/roster-level (unchanged). When a
          project is chosen the RPC requires the worker to be ACTIVELY assigned to
          it, else returns not_authorized. Only shown when the manager has projects. */}
      {projects.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono uppercase tracking-label text-text-muted">
            {labels.projectScopeLabel}
          </span>
          <select
            name="project_id"
            defaultValue=""
            data-testid="instruction-project-scope"
            className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
          >
            <option value="">{labels.teamLevelOption}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.id.slice(0, 8)}
                {p.city ? ` · ${p.city}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">
          {labels.bodyLabel}
        </span>
        <textarea
          name="body"
          rows={4}
          required
          placeholder={labels.bodyPlaceholder}
          className="rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary"
        />
      </label>

      <p className="text-meta leading-relaxed text-text-muted">
        {labels.languageNote}
      </p>

      {/* Honest permission-scope label: an instruction is either TEAM-level (no
          project) or PROJECT-level (a worker actively assigned to that project).
          Project scope is real as of F5 — see the project selector above. */}
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="instruction-scope-note"
      >
        {labels.scopeNote}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5"
        >
          {pending ? labels.sending : labels.send}
        </button>
        {state?.ok && (
          <span className="text-xs text-state-success" role="status">
            {labels.sent}
          </span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-state-danger" role="status">
            {state.code === "not_authorized"
              ? labels.notAuthorized
              : state.code === "needs_migration"
                ? labels.needsMigration
                : labels.errorMsg}
          </span>
        )}
      </div>
    </form>
  );
}
