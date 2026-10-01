"use client";

import { useActionState } from "react";

import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";

export interface PerformingCompanyFormLabels {
  readonly performedBy: string;
  readonly note: string;
  readonly button: string;
  /** "Attributed N records; M were already attributed." with {count} and {skipped} resolved server-side is not possible here, so the two numbers are formatted client-side from this template. */
  readonly done: string;
  readonly refused: string;
}

/**
 * ONE person's records → the organization that performed them. A thin form
 * over the existing server action; it carries a roster person id, a choice
 * among the caller's own other organizations and an optional note.
 */
export function PerformingCompanyForm({
  action,
  labels,
  personId,
  options,
}: {
  action: (prev: EvidenceImportActionState, form: FormData) => Promise<EvidenceImportActionState>;
  labels: PerformingCompanyFormLabels;
  personId: string;
  options: readonly { readonly id: string; readonly name: string }[];
}) {
  const [state, submit, pending] = useActionState<EvidenceImportActionState, FormData>(action, { kind: "idle" });
  const m = state.kind === "ok" && state.note ? /^attributed:(\d+):skipped:(\d+)$/.exec(state.note) : null;
  return (
    <form
      action={submit}
      className="flex flex-wrap items-end gap-2"
      data-testid="performing-company-form"
      data-person={personId}
    >
      <input type="hidden" name="person_id" value={personId} />
      <label className="flex min-w-44 flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.performedBy}</span>
        <select
          name="performing_organization_id"
          className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary"
          defaultValue={options[0]?.id}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.note}</span>
        <input
          name="note"
          maxLength={200}
          className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1.5 text-sm text-text-primary"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-ink-500 px-3 py-1.5 text-sm font-semibold text-text-primary hover:border-brand-blue disabled:opacity-60"
      >
        {labels.button}
      </button>
      {m ? (
        <p className="basis-full text-meta text-text-secondary" role="status" data-testid="performing-company-done">
          {labels.done.replace("{count}", m[1]!).replace("{skipped}", m[2]!)}
        </p>
      ) : null}
      {state.kind === "refused" ? (
        <p className="basis-full text-meta text-state-amber" role="alert" data-testid="performing-company-refused">
          {labels.refused}
        </p>
      ) : null}
    </form>
  );
}
