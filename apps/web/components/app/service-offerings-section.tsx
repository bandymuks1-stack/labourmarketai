"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Eye, Pause, Play } from "lucide-react";
import {
  MarketEntryActions,
  MarketEntryChip,
  MarketEntryVisibility,
} from "@/components/app/market-entry-lifecycle";
import { serviceAdapter } from "@/lib/market-lifecycle/adapters";
import type { EntryAction } from "@/lib/market-lifecycle/contract";
import {
  createServiceOffering,
  updateServiceOffering,
  applyServiceOfferingAction,
  deleteServiceOffering,
} from "@/lib/services/service-offerings";
import { PARTNERSHIP_CATEGORY } from "@/lib/services/service-offerings-shared";
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
  /** Quick path: publish a "we are looking for partners" offering. */
  addPartnership: string;
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
  errorTitleRequired: string;
  errorCountry: string;
  errorGeneric: string;
  /** Delete refused: the offering has requests — pause it instead. */
  errorHasRequests: string;
  remoteBadge: string;
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

/** Test ids the walk specs already use, one per contract action. Publish,
 *  pause and resume never appear together, so they share the toggle id. */
const SERVICE_TEST_ID: Record<EntryAction, string> = {
  publish: "service-offering-toggle",
  pause: "service-offering-toggle",
  resume: "service-offering-toggle",
  complete: "service-offering-close",
  withdraw: "service-offering-withdraw",
  edit: "service-offering-edit",
};

export function ServiceOfferingsSection({
  initialRows,
  needsMigration,
  closedSupported = false,
  labels,
}: {
  initialRows: ServiceOfferingRow[];
  needsMigration: boolean;
  /** The closed state is stored (lifecycle migration applied). */
  closedSupported?: boolean;
  labels: ServiceOfferingsLabels;
}) {
  // The ONE lifecycle contract's view of an offering (lib/market-lifecycle).
  const adapter = serviceAdapter({ closedSupported });
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

  function openCreatePartnership() {
    setError(null);
    setDraft({ ...EMPTY_DRAFT, categorySlug: PARTNERSHIP_CATEGORY });
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

  /** A lifecycle contract action from the row (`MarketEntryActions`). */
  function runAction(row: ServiceOfferingRow, action: EntryAction) {
    if (action === "edit") {
      openEdit(row);
      return;
    }
    startTransition(async () => {
      const result = await applyServiceOfferingAction(row.id, action);
      if (result.kind === "ok") router.refresh();
      else setError(labels.errorGeneric);
    });
  }

  function remove(row: ServiceOfferingRow) {
    startTransition(async () => {
      const result = await deleteServiceOffering(row.id);
      if (result.kind === "ok") router.refresh();
      else if (result.kind === "has-requests") setError(labels.errorHasRequests);
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openCreate}
                data-testid="service-offering-add"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-blue bg-brand-blue px-3 py-1.5 text-xs font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {labels.addButton}
              </button>
              <button
                type="button"
                onClick={openCreatePartnership}
                data-testid="service-offering-add-partnership"
                className="inline-flex w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {labels.addPartnership}
              </button>
            </div>
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
                    data-testid="service-offering-category"
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
                    data-testid="service-offering-country"
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
                  data-testid="service-offering-rate"
                  onChange={(e) => setDraft({ ...draft, rateText: e.target.value })}
                  placeholder={labels.formRatePlaceholder}
                  maxLength={120}
                />
                <span className="text-meta text-text-muted">{labels.formRateHint}</span>
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
                    <span className="shrink-0">
                      <MarketEntryChip
                        facts={adapter.facts(row)}
                        testId={`service-offering-status-${row.id}`}
                      />
                    </span>
                  </div>
                  {row.description && (
                    <p className="text-xs leading-relaxed text-text-secondary">{row.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-text-muted">
                    {row.categorySlug && <span>{row.categorySlug}</span>}
                    {row.locationCountry && <span>{row.locationCountry}</span>}
                    {row.remote && <span>{labels.remoteBadge}</span>}
                    {row.rateText && <span>{row.rateText}</span>}
                  </div>
                  {/* Whether others can find it now — the ONE lifecycle
                      contract's line; only an ACTIVE offering is findable. */}
                  <MarketEntryVisibility
                    facts={adapter.facts(row)}
                    testId={`service-offering-discoverability-${row.id}`}
                  />
                  {/* The contract's actions in words; permanent deletion is
                      data erasure, apart, behind the strong-tier confirmation
                      (refused for an offering that has requests). */}
                  <MarketEntryActions
                    support={adapter.support}
                    facts={adapter.facts(row)}
                    onAction={(action) => runAction(row, action)}
                    pending={pending}
                    testIdFor={(action) => `${SERVICE_TEST_ID[action]}-${row.id}`}
                    erase={{ onConfirm: () => remove(row), testId: `service-offering-delete-${row.id}` }}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
