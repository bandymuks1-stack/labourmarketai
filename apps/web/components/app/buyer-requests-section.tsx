"use client";

import { useActionState } from "react";

import {
  saveBuyerRequestAction,
  type BuyerRequestFormState,
} from "@/lib/buyer/request-actions";
import type { CustomerRequestRow } from "@/lib/buyer/customer-requests";
import {
  BuyerRequestAttachmentUploader,
  type AttachmentListItem,
  type BuyerRequestAttachmentUploaderLabels,
} from "@/components/app/buyer-request-attachment-uploader";

/**
 * Stage 2 — Buyer demand/request section.
 *
 * Server parent passes the RLS-respected request list; this client
 * renderer shows the new-request form + the active request list +
 * an honest empty state. Manual review only: no automatic matching,
 * no fake candidates surfaced anywhere on this surface.
 */

export interface BuyerRequestsSectionLabels {
  readonly heading: string;
  readonly subheading: string;
  readonly newRequestHeading: string;
  readonly newRequestSubtitle: string;
  readonly fieldTitle: string;
  readonly fieldTitlePlaceholder: string;
  readonly fieldTitleHelp: string;
  readonly fieldNeedSummary: string;
  readonly fieldNeedSummaryPlaceholder: string;
  readonly fieldCountry: string;
  readonly fieldCountryPlaceholder: string;
  readonly fieldLocation: string;
  readonly fieldLocationPlaceholder: string;
  readonly fieldRole: string;
  readonly fieldRolePlaceholder: string;
  readonly fieldTeamSize: string;
  readonly fieldTeamSizePlaceholder: string;
  readonly fieldStartPeriod: string;
  readonly fieldStartPeriodPlaceholder: string;
  readonly fieldDuration: string;
  readonly fieldDurationPlaceholder: string;
  readonly fieldLanguage: string;
  readonly fieldLanguagePlaceholder: string;
  readonly fieldNotes: string;
  readonly fieldNotesPlaceholder: string;
  readonly statusLabel: string;
  readonly statusDraft: string;
  readonly statusSubmitted: string;
  readonly statusHelp: string;
  readonly submit: string;
  readonly resultSaved: string;
  readonly resultNeedsMigration: string;
  readonly resultInvalid: string;
  readonly resultError: string;
  readonly listHeading: string;
  readonly emptyStateHeading: string;
  readonly emptyStateBody: string;
  readonly columnTitle: string;
  readonly columnStatus: string;
  readonly columnUpdated: string;
  readonly manualReviewBanner: string;
  readonly migrationBlockerHeading: string;
  readonly migrationBlockerBody: string;
  readonly attachmentsHeading: string;
  readonly attachmentsEmpty: string;
  readonly attachmentsMigrationBlocker: string;
  readonly attachmentsAnalysisFallback: string;
  readonly attachmentsUploader: BuyerRequestAttachmentUploaderLabels;
}

type ListState =
  | { kind: "ok"; rows: readonly CustomerRequestRow[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

type AttachmentsState =
  | { kind: "ok"; rows: readonly AttachmentListItem[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export function BuyerRequestsSection({
  listResult,
  attachmentsResult,
  labels,
}: {
  readonly listResult: ListState;
  readonly attachmentsResult: AttachmentsState;
  readonly labels: BuyerRequestsSectionLabels;
}) {
  const [state, formAction, isPending] = useActionState<
    BuyerRequestFormState | null,
    FormData
  >(saveBuyerRequestAction, null);

  const rows = listResult.kind === "ok" ? listResult.rows : [];
  const migrationNeeded = listResult.kind === "needs-migration";
  const attachmentsByRequest = (() => {
    const m = new Map<string, AttachmentListItem[]>();
    if (attachmentsResult.kind === "ok") {
      for (const a of attachmentsResult.rows) {
        const arr = m.get(a.requestId) ?? [];
        arr.push(a);
        m.set(a.requestId, arr);
      }
    }
    return m;
  })();
  const attachmentsMigrationNeeded =
    attachmentsResult.kind === "needs-migration";

  const banner: { tone: "success" | "warning"; text: string } | null = (() => {
    if (!state) return null;
    if (state.ok) return { tone: "success", text: labels.resultSaved };
    switch (state.code) {
      case "needs_migration":
        return { tone: "warning", text: labels.resultNeedsMigration };
      case "invalid":
        return { tone: "warning", text: state.message ?? labels.resultInvalid };
      default:
        return { tone: "warning", text: state.message ?? labels.resultError };
    }
  })();

  return (
    <section
      className="card-border flex flex-col gap-5 p-5"
      data-testid="buyer-requests-section"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.heading}
        </h2>
        <p className="text-sm text-text-secondary">{labels.subheading}</p>
      </header>

      <p
        className="rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
        data-testid="buyer-requests-manual-review-banner"
      >
        {labels.manualReviewBanner}
      </p>

      {migrationNeeded ? (
        <div
          className="rounded-md border border-state-warning bg-state-warning/10 p-3"
          data-testid="buyer-requests-migration-blocker"
        >
          <p className="font-mono text-[10px] uppercase tracking-label text-state-warning">
            {labels.migrationBlockerHeading}
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {labels.migrationBlockerBody}
          </p>
        </div>
      ) : null}

      <section
        className="flex flex-col gap-2"
        data-testid="buyer-requests-list"
      >
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {labels.listHeading}
        </h3>
        {rows.length === 0 ? (
          <div
            className="rounded-md border border-dashed border-ink-500 p-3"
            data-testid="buyer-requests-empty"
          >
            <p className="text-xs font-semibold text-text-primary">
              {labels.emptyStateHeading}
            </p>
            <p className="text-xs text-text-secondary">{labels.emptyStateBody}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const requestAttachments = attachmentsByRequest.get(r.id) ?? [];
              return (
                <li
                  key={r.id}
                  className="card-border flex flex-col gap-2 p-3"
                  data-testid={`buyer-request-row-${r.id}`}
                >
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <span className="text-text-primary">{r.title}</span>
                    <span className="text-text-secondary">{r.status}</span>
                    <span className="text-text-muted">
                      {r.updatedAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="border-t border-ink-700 pt-2">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {labels.attachmentsHeading}
                    </p>
                    {attachmentsMigrationNeeded ? (
                      <p
                        className="rounded-md border border-state-warning bg-state-warning/10 px-2 py-1 text-[11px] text-state-warning"
                        data-testid={`buyer-request-attachments-blocker-${r.id}`}
                      >
                        {labels.attachmentsMigrationBlocker}
                      </p>
                    ) : (
                      <>
                        {requestAttachments.length === 0 ? (
                          <p className="text-[11px] text-text-muted">
                            {labels.attachmentsEmpty}
                          </p>
                        ) : null}
                        <BuyerRequestAttachmentUploader
                          requestId={r.id}
                          attachments={requestAttachments}
                          analysisFallbackLine={labels.attachmentsAnalysisFallback}
                          labels={labels.attachmentsUploader}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form
        action={formAction}
        className="flex flex-col gap-3"
        data-testid="buyer-requests-form"
      >
        <header className="flex flex-col gap-1">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {labels.newRequestHeading}
          </h3>
          <p className="text-xs text-text-secondary">
            {labels.newRequestSubtitle}
          </p>
        </header>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.fieldTitle}</span>
          <input
            type="text"
            name="title"
            required
            minLength={1}
            maxLength={200}
            placeholder={labels.fieldTitlePlaceholder}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="buyer-requests-field-title"
          />
          <span className="text-[11px] text-text-muted">
            {labels.fieldTitleHelp}
          </span>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.fieldNeedSummary}</span>
          <textarea
            name="need_summary"
            rows={3}
            maxLength={2000}
            placeholder={labels.fieldNeedSummaryPlaceholder}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="buyer-requests-field-need-summary"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldCountry}</span>
            <input
              type="text"
              name="country"
              maxLength={100}
              placeholder={labels.fieldCountryPlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-country"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldLocation}</span>
            <input
              type="text"
              name="location"
              maxLength={200}
              placeholder={labels.fieldLocationPlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-location"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldRole}</span>
            <input
              type="text"
              name="role_or_work_type"
              maxLength={200}
              placeholder={labels.fieldRolePlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-role"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldTeamSize}</span>
            <input
              type="number"
              name="team_size"
              min={1}
              max={9999}
              placeholder={labels.fieldTeamSizePlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-team-size"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldStartPeriod}</span>
            <input
              type="text"
              name="start_period"
              maxLength={200}
              placeholder={labels.fieldStartPeriodPlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-start-period"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-text-secondary">{labels.fieldDuration}</span>
            <input
              type="text"
              name="duration"
              maxLength={200}
              placeholder={labels.fieldDurationPlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-duration"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-text-secondary">{labels.fieldLanguage}</span>
            <input
              type="text"
              name="language_requirement"
              maxLength={200}
              placeholder={labels.fieldLanguagePlaceholder}
              className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              data-testid="buyer-requests-field-language"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-text-secondary">{labels.fieldNotes}</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder={labels.fieldNotesPlaceholder}
            className="rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            data-testid="buyer-requests-field-notes"
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-xs">
          <legend className="text-text-secondary">{labels.statusLabel}</legend>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="draft"
              defaultChecked
              data-testid="buyer-requests-status-draft"
            />
            <span>{labels.statusDraft}</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="status"
              value="submitted"
              data-testid="buyer-requests-status-submitted"
            />
            <span>{labels.statusSubmitted}</span>
          </label>
          <span className="text-[11px] text-text-muted">{labels.statusHelp}</span>
        </fieldset>

        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-brand-blue px-4 py-2 text-sm font-semibold text-text-primary hover:bg-brand-blue/80 disabled:opacity-50"
          data-testid="buyer-requests-submit"
        >
          {labels.submit}
        </button>

        {banner ? (
          <p
            className={
              banner.tone === "success"
                ? "rounded-md border border-state-success bg-state-success/10 px-3 py-2 text-xs text-state-success"
                : "rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
            }
            role="status"
            data-testid="buyer-requests-result"
          >
            {banner.text}
          </p>
        ) : null}
      </form>
    </section>
  );
}
