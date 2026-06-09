"use client";

import { useActionState } from "react";

import {
  sendWorkInstructionAction,
  type InstructionActionResult,
} from "@/lib/instructions/actions";
import type { ManagedWorker } from "@/lib/instructions/instructions";

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
  noWorkers: string;
  scopeNote: string;
}

export function ManagerInstructionComposer({
  workers,
  defaultLanguage,
  labels,
}: {
  workers: ManagedWorker[];
  /** The manager's current UI locale — stored as the instruction's original language. */
  defaultLanguage: string;
  labels: ComposerLabels;
}) {
  const [state, action, pending] = useActionState<
    InstructionActionResult | null,
    FormData
  >(sendWorkInstructionAction, null);

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
          defaultValue=""
          required
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
      </label>

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

      <p className="text-[11px] leading-relaxed text-text-muted">
        {labels.languageNote}
      </p>

      {/* Honest permission-scope label: today instructions are gated at ROSTER
          (whole-team) level; precise project/site scope activates once workers
          are assigned to projects (project_worker_assignments is empty). No fake
          project precision is claimed. See work-instructions-project-scope-design-v1. */}
      <p
        className="text-[11px] leading-relaxed text-text-muted"
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
