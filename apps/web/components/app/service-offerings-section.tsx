"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, Pause, Play } from "lucide-react";
import {
  createServiceOffering,
  updateServiceOffering,
  setServiceOfferingStatus,
  deleteServiceOffering,
} from "@/lib/services/service-offerings";
import type {
  ServiceOfferingRow,
  ServiceOfferingStatus,
} from "@/lib/services/service-offerings-shared";

/**
 * Provider-owned service offerings manager (W8 Phase 1). Real data only — every
 * row comes from the caller's own RLS-scoped rows; there are NO seed/demo rows
 * and no payment. When the table is not applied yet the parent passes
 * `needsMigration` and we show a calm "not available yet" state, never an error.
 *
 * Phase 1 is management only: create / edit / activate-pause / delete YOUR OWN
 * offerings. Cross-user discovery and booking-a-service are out of scope.
 */

export type ServiceOfferingsLabels = {
  title: string;
  intro: string;
  notAvailable: string;
  empty: string;
  addButton: string;
  formTitleLabel: string;
  formTitlePlaceholder: string;
  formDescriptionLabel: string;
  formDescriptionPlaceholder: string;
  formCategoryLabel: string;
  formCategoryPlaceholder: string;
  formCountryLabel: string;
  formCountryPlaceholder: string;
  formRemoteLabel: string;
  formRateLabel: string;
  formRatePlaceholder: string;
  formRateHint: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  remove: string;
  activate: string;
  pause: string;
  errorTitleRequired: string;
  errorCountry: string;
  errorGeneric: string;
  remoteBadge: string;
  status: Record<ServiceOfferingStatus, string>;
};

type Draft = {
  title: string;
  description: string;
  categorySlug: string;
  locationCountry: string;
  remote: boolean;
  rateText: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  categorySlug: "",
  locationCountry: "",
  remote: false,
  rateText: "",
};

const STATUS_RING: Record<ServiceOfferingStatus, string> = {
  draft: "border-ink-500 bg-ink-800/40 text-text-muted",
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  paused: "border-state-warning/40 bg-state-warning/5 text-state-warning",
};

export function ServiceOfferingsSection({
  initialRows,
  needsMigration,
  labels,
}: {
  initialRows: ServiceOfferingRow[];
  needsMigration: boolean;
  labels: ServiceOfferingsLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<
    { kind: "idle" } | { kind: "create" } | { kind: "edit"; id: string }
  >({ kind: "idle" });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  function openCreate() {
    setError(null);
    setDraft(EMPTY_DRAFT);
    setMode({ kind: "create" });
  }

  function openEdit(row: ServiceOfferingRow) {
    setError(null);
    setDraft({
      title: row.title,
      description: row.description ?? "",
      categorySlug: row.categorySlug ?? "",
      locationCountry: row.locationCountry ?? "",
      remote: row.remote,
      rateText: row.rateText ?? "",
    });
    setMode({ kind: "edit", id: row.id });
  }

  function close() {
    setMode({ kind: "idle" });
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  function applyResult(result: { kind: string; field?: string }) {
    if (result.kind === "ok") {
      close();
      router.refresh();
      return;
    }
    if (result.kind === "invalid") {
      setError(result.field === "locationCountry" ? labels.errorCountry : labels.errorTitleRequired);
      return;
    }
    setError(labels.errorGeneric);
  }

  function submit() {
    if (!draft.title.trim()) {
      setError(labels.errorTitleRequired);
      return;
    }
    setError(null);
    const input = {
      title: draft.title,
      description: draft.description,
      categorySlug: draft.categorySlug,
      locationCountry: draft.locationCountry,
      remote: draft.remote,
      rateText: draft.rateText,
    };
    startTransition(async () => {
      const result =
        mode.kind === "edit"
          ? await updateServiceOffering(mode.id, input)
          : await createServiceOffering(input);
      applyResult(result);
    });
  }

  function toggleStatus(row: ServiceOfferingRow) {
    const next: ServiceOfferingStatus = row.status === "active" ? "paused" : "active";
    startTransition(async () => {
      const result = await setServiceOfferingStatus(row.id, next);
      if (result.kind === "ok") router.refresh();
      else setError(labels.errorGeneric);
    });
  }

  function remove(row: ServiceOfferingRow) {
    startTransition(async () => {
      const result = await deleteServiceOffering(row.id);
      if (result.kind === "ok") router.refresh();
      else setError(labels.errorGeneric);
    });
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="service-offerings-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">{labels.intro}</p>
      </header>

      {needsMigration ? (
        // Honest degradation — the data model is not applied yet. Calm note,
        // never an error, never a fake offering.
        <p
          className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="service-offerings-not-available"
        >
          {labels.notAvailable}
        </p>
      ) : (
        <>
          {mode.kind === "idle" ? (
            <button
              type="button"
              onClick={openCreate}
              data-testid="service-offering-add"
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {labels.addButton}
            </button>
          ) : (
            <div
              className="flex flex-col gap-3 rounded-lg border border-ink-500 bg-ink-800/40 p-4"
              data-testid="service-offering-form"
            >
              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                {labels.formTitleLabel}
                <input
                  className={inputCls}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={labels.formTitlePlaceholder}
                  data-testid="service-offering-title"
                  maxLength={120}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                {labels.formDescriptionLabel}
                <textarea
                  className={`${inputCls} min-h-20`}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={labels.formDescriptionPlaceholder}
                  maxLength={2000}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {labels.formCategoryLabel}
                  <input
                    className={inputCls}
                    value={draft.categorySlug}
                    onChange={(e) => setDraft({ ...draft, categorySlug: e.target.value })}
                    placeholder={labels.formCategoryPlaceholder}
                    maxLength={80}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {labels.formCountryLabel}
                  <input
                    className={inputCls}
                    value={draft.locationCountry}
                    onChange={(e) => setDraft({ ...draft, locationCountry: e.target.value })}
                    placeholder={labels.formCountryPlaceholder}
                    maxLength={2}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                {labels.formRateLabel}
                <input
                  className={inputCls}
                  value={draft.rateText}
                  onChange={(e) => setDraft({ ...draft, rateText: e.target.value })}
                  placeholder={labels.formRatePlaceholder}
                  maxLength={120}
                />
                <span className="text-[11px] text-text-muted">{labels.formRateHint}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={draft.remote}
                  onChange={(e) => setDraft({ ...draft, remote: e.target.checked })}
                  data-testid="service-offering-remote"
                />
                {labels.formRemoteLabel}
              </label>
              {error && (
                <p className="text-xs text-state-danger" role="alert" data-testid="service-offering-error">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  data-testid="service-offering-save"
                  className="rounded-md border border-brand-blue/50 bg-brand-blue/10 px-3 py-1.5 text-xs font-semibold text-brand-blue hover:border-brand-blue disabled:opacity-60"
                >
                  {pending ? labels.saving : labels.save}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  {labels.cancel}
                </button>
              </div>
            </div>
          )}

          {initialRows.length === 0 ? (
            <p
              className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-secondary"
              data-testid="service-offerings-empty"
            >
              {labels.empty}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="service-offerings-list">
              {initialRows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3"
                  data-testid={`service-offering-row-${row.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="break-words text-sm font-medium text-text-primary">
                      {row.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_RING[row.status]}`}
                      data-testid={`service-offering-status-${row.id}`}
                    >
                      {labels.status[row.status]}
                    </span>
                  </div>
                  {row.description && (
                    <p className="text-xs leading-relaxed text-text-secondary">{row.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                    {row.categorySlug && <span>{row.categorySlug}</span>}
                    {row.locationCountry && <span>{row.locationCountry}</span>}
                    {row.remote && <span>{labels.remoteBadge}</span>}
                    {row.rateText && <span>{row.rateText}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleStatus(row)}
                      disabled={pending}
                      data-testid={`service-offering-toggle-${row.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary disabled:opacity-60"
                    >
                      {row.status === "active" ? (
                        <>
                          <Pause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          {labels.pause}
                        </>
                      ) : (
                        <>
                          {row.status === "paused" ? (
                            <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          )}
                          {labels.activate}
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-secondary hover:border-brand-blue hover:text-text-primary"
                      data-testid={`service-offering-edit-${row.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {labels.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-500 px-2.5 py-1 text-xs font-medium text-text-muted hover:border-state-danger hover:text-state-danger disabled:opacity-60"
                      data-testid={`service-offering-delete-${row.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {labels.remove}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
