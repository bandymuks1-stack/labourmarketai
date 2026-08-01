"use client";

import { useActionState } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";

import {
  upsertWorkerDocumentAction,
  type WorkerDocumentSaveState,
} from "@/lib/documents/document-actions";

/**
 * Worker document editor (W4 Slice 2) — the FIRST write path into
 * `worker_documents`. Facts about a document the worker HOLDS (type, country,
 * status, validity window, note) — no file upload exists yet and the page
 * says so honestly right above this form. Owner-scoped + audited by the
 * `upsert_worker_document` RPC; same (type, country) upserts the same row.
 *
 * DESIGN (owner directive: frontend-design pass, one premium language):
 * the form speaks the documents page's own vocabulary — the STATUS control is
 * a tone-matched chip radio group using the exact STATUS_TONE colours of the
 * inventory rows it creates (ready = success, missing/blocked = warning), so
 * the input visually rhymes with its output one section above; labels are the
 * page's mono-meta eyebrows; the validity window is the visually primary
 * pair (expiry is the inventory's central fact); every control keeps the
 * 44px touch floor and the brand-blue focus ring.
 */

export interface WorkerDocumentFormLabels {
  title: string;
  typeLabel: string;
  countryLabel: string;
  countryNone: string;
  statusLabel: string;
  validFromLabel: string;
  validUntilLabel: string;
  noteLabel: string;
  notePlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  invalid: string;
  needsMigration: string;
  errorMsg: string;
}

const FIELD =
  "min-h-11 rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary transition-colors focus:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/60";

const EYEBROW = "font-mono text-meta uppercase tracking-label text-text-muted";

/** The SAME tones the inventory rows above the form render (STATUS_TONE). */
const STATUS_CHIP_TONE: Record<string, string> = {
  ready: "peer-checked:border-state-success/60 peer-checked:bg-state-success/10 peer-checked:text-state-success",
  missing: "peer-checked:border-state-warning/50 peer-checked:bg-state-warning/5 peer-checked:text-state-warning",
  blocked: "peer-checked:border-state-warning/70 peer-checked:bg-state-warning/10 peer-checked:text-state-warning",
};

export function WorkerDocumentForm({
  labels,
  typeOptions,
  statusOptions,
  countryOptions,
}: {
  labels: WorkerDocumentFormLabels;
  /** [slug, localized label] — resolved server-side from the registry. */
  typeOptions: readonly (readonly [string, string])[];
  /** [value, localized label] for ready/missing/blocked. */
  statusOptions: readonly (readonly [string, string])[];
  countryOptions: readonly string[];
}) {
  const locale = useLocale();
  const [state, action, pending] = useActionState<
    WorkerDocumentSaveState,
    FormData
  >(upsertWorkerDocumentAction, null);

  return (
    <form
      action={action}
      className="card-border relative flex flex-col gap-4 overflow-hidden p-5"
      data-testid="worker-document-form"
    >
      {/* A quiet brand seam ties the editor to the primary action colour —
          the one card on this page that WRITES. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 bg-gradient-to-b from-brand-blue/70 via-brand-blue/20 to-transparent"
      />
      <h3 className="font-display text-base font-semibold tracking-tightest text-text-primary">
        {labels.title}
      </h3>
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs">
          <span className={EYEBROW}>{labels.typeLabel}</span>
          <select name="document_type_slug" required className={FIELD}>
            {typeOptions.map(([slug, label]) => (
              <option key={slug} value={slug}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-xs">
          <span className={EYEBROW}>{labels.countryLabel}</span>
          <select name="country" className={FIELD} defaultValue="">
            <option value="">{labels.countryNone}</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Status — chip radios in the SAME tones as the inventory badges the
          save will produce; the input rhymes with its output. */}
      <fieldset className="flex flex-col gap-1.5">
        <legend className={EYEBROW}>{labels.statusLabel}</legend>
        <div className="flex flex-wrap gap-2 pt-1.5">
          {statusOptions.map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="status"
                value={value}
                defaultChecked={value === "ready"}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 py-2 font-mono text-meta uppercase tracking-label text-text-secondary transition-colors hover:border-brand-blue peer-focus-visible:ring-2 peer-focus-visible:ring-brand-blue/60",
                  STATUS_CHIP_TONE[value] ?? "peer-checked:border-brand-blue peer-checked:text-brand-blue",
                )}
              >
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Validity window — the inventory's central fact gets the primary
          visual pair. */}
      <div className="grid gap-4 rounded-md border border-ink-600/60 bg-ink-800/30 p-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs">
          <span className={EYEBROW}>{labels.validFromLabel}</span>
          <input type="date" name="valid_from" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs">
          <span className={EYEBROW}>{labels.validUntilLabel}</span>
          <input type="date" name="valid_until" className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-xs">
        <span className={EYEBROW}>{labels.noteLabel}</span>
        <input
          type="text"
          name="note"
          maxLength={500}
          placeholder={labels.notePlaceholder}
          className={FIELD}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue bg-brand-blue/10 px-5 py-2 text-sm font-semibold text-brand-blue transition-colors hover:bg-brand-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/60 disabled:opacity-60"
          data-testid="worker-document-save"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {state?.ok === true && (
          <p
            className="text-sm text-state-success"
            data-testid="worker-document-saved"
          >
            {labels.saved}
          </p>
        )}
        {state && state.ok === false && (
          <p
            className="text-sm text-state-warning"
            role="alert"
            data-testid="worker-document-error"
          >
            {state.code === "invalid"
              ? labels.invalid
              : state.code === "needs_migration"
                ? labels.needsMigration
                : labels.errorMsg}
          </p>
        )}
      </div>
    </form>
  );
}
