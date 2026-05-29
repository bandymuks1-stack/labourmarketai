"use client";

import { useActionState } from "react";

import {
  saveBuyerRequestAction,
  type BuyerRequestFormState,
} from "@/lib/buyer/request-actions";
import type {
  CustomerRequestRow,
  CustomerRequestStatus,
} from "@/lib/buyer/customer-requests";
import {
  computeRequestReadiness,
  type RequestNextAction,
  type RequestReadinessStatus,
} from "@/lib/buyer/request-readiness";
import type { ExtractionReadiness } from "@/lib/buyer/attachment-readiness";
import {
  computeRequestCompletion,
  type RequestCompletionItemKey,
} from "@/lib/buyer/request-completion";
import {
  computeRequestTimeline,
  type RequestTimelineEventKey,
} from "@/lib/buyer/request-timeline";
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
  readonly understanding: BuyerRequestUnderstandingLabels;
}

export interface BuyerRequestUnderstandingLabels {
  readonly panelHeading: string;
  readonly basicsHeading: string;
  readonly labelStatus: string;
  readonly labelCreated: string;
  readonly labelDescription: string;
  readonly noDescription: string;
  readonly readinessHeading: string;
  readonly readinessStatus: Record<RequestReadinessStatus, string>;
  readonly honestMessage: string;
  readonly nextActionHeading: string;
  readonly nextAction: Record<RequestNextAction, string>;
  readonly filesHeading: string;
  readonly analysisStatusLabel: string;
  readonly analysisNotStarted: string;
  readonly fileReviewChip: string;
  readonly requestStatus: Record<CustomerRequestStatus, string>;
  readonly extractionReadiness: Record<ExtractionReadiness, string>;
  readonly completion: {
    readonly heading: string;
    readonly doneLabel: string;
    readonly missingLabel: string;
    readonly items: Record<RequestCompletionItemKey, string>;
  };
  readonly timeline: {
    readonly heading: string;
    readonly events: Record<RequestTimelineEventKey, string>;
  };
  readonly workflow: {
    readonly heading: string;
    readonly futureLabel: string;
    readonly steps: {
      readonly request: string;
      readonly files: string;
      readonly readiness: string;
      readonly adminReview: string;
      readonly futureHelper: string;
    };
  };
}

/** Status-chip tone for each deterministic readiness state. */
const READINESS_CHIP_CLASS: Record<RequestReadinessStatus, string> = {
  no_files:
    "rounded-full bg-ink-700/40 px-2 py-0.5 text-[11px] text-text-muted",
  needs_more_info:
    "rounded-full bg-state-warning/15 px-2 py-0.5 text-[11px] text-state-warning",
  files_added:
    "rounded-full bg-brand-blue/15 px-2 py-0.5 text-[11px] text-brand-blue",
  enough_for_manual_review:
    "rounded-full bg-state-success/15 px-2 py-0.5 text-[11px] text-state-success",
};

/**
 * Subtle left status rail per readiness state (PR D — visual clarity
 * only, no behaviour change). Gives the card a scannable colour anchor
 * that matches the readiness chip.
 */
const READINESS_RAIL_CLASS: Record<RequestReadinessStatus, string> = {
  no_files: "border-l-4 border-l-ink-500",
  needs_more_info: "border-l-4 border-l-state-warning/60",
  files_added: "border-l-4 border-l-brand-blue/60",
  enough_for_manual_review: "border-l-4 border-l-state-success/70",
};

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

      {/* Lightweight workflow stepper — explains the flow; the future
          structured helper is visibly marked as not enabled. */}
      <div className="flex flex-col gap-1" data-testid="buyer-requests-workflow">
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {labels.understanding.workflow.heading}
        </p>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px]">
          {[
            { label: labels.understanding.workflow.steps.request, future: false },
            { label: labels.understanding.workflow.steps.files, future: false },
            { label: labels.understanding.workflow.steps.readiness, future: false },
            {
              label: labels.understanding.workflow.steps.adminReview,
              future: false,
            },
            {
              label: labels.understanding.workflow.steps.futureHelper,
              future: true,
            },
          ].map((s, i, arr) => (
            <li key={s.label} className="flex items-center gap-1">
              <span
                className={
                  s.future
                    ? "rounded-full border border-dashed border-ink-500 px-2 py-0.5 text-text-muted"
                    : "rounded-full bg-ink-700/40 px-2 py-0.5 text-text-secondary"
                }
              >
                {s.label}
                {s.future ? ` · ${labels.understanding.workflow.futureLabel}` : ""}
              </span>
              {i < arr.length - 1 ? (
                <span aria-hidden className="text-text-muted">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

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
              const u = labels.understanding;
              // Deterministic, transparent product logic — no AI / OCR /
              // verification. Computed only from real request + attachment
              // metadata the buyer already provided.
              const readiness = computeRequestReadiness({
                description: r.needSummary,
                attachmentCount: requestAttachments.length,
              });
              const completion = computeRequestCompletion({
                description: r.needSummary,
                attachmentCount: requestAttachments.length,
                location: r.location,
                country: r.country,
                startPeriod: r.startPeriod,
                duration: r.duration,
              });
              const timeline = computeRequestTimeline({
                createdAt: r.createdAt,
                status: r.status,
                attachments: requestAttachments,
              });
              const hasDescription = Boolean(r.needSummary?.trim());
              return (
                <li
                  key={r.id}
                  className={`card-border flex flex-col gap-3 p-3 sm:p-4 ${READINESS_RAIL_CLASS[readiness.status]}`}
                  data-testid={`buyer-request-row-${r.id}`}
                  data-readiness={readiness.status}
                >
                  {/* 1. Request basics + readiness chip */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-display text-sm font-semibold text-text-primary">
                        {r.title}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                        {u.labelCreated}: {r.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    <span
                      className={READINESS_CHIP_CLASS[readiness.status]}
                      data-testid={`buyer-request-readiness-${r.id}`}
                    >
                      {u.readinessStatus[readiness.status]}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-text-muted">{u.labelStatus}:</span>
                      <span className="rounded bg-ink-700/40 px-2 py-0.5 text-text-secondary">
                        {u.requestStatus[r.status] ?? r.status}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-text-muted">
                        {u.labelDescription}:
                      </span>
                      <span
                        className={
                          hasDescription
                            ? "line-clamp-3 text-text-secondary"
                            : "italic text-text-muted"
                        }
                      >
                        {hasDescription ? r.needSummary : u.noDescription}
                      </span>
                    </div>
                  </div>

                  {/* Completeness checklist — deterministic, real fields only. */}
                  <div
                    className="flex flex-col gap-1"
                    data-testid={`buyer-request-completion-${r.id}`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {u.completion.heading} · {completion.doneCount}/
                      {completion.totalCount}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {completion.items.map((item) => (
                        <li
                          key={item.key}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          <span
                            aria-hidden
                            className={
                              item.done
                                ? "text-state-success"
                                : "text-text-muted"
                            }
                          >
                            {item.done ? "✓" : "○"}
                          </span>
                          <span
                            className={
                              item.done
                                ? "text-text-secondary"
                                : "text-text-muted"
                            }
                          >
                            {u.completion.items[item.key]}
                          </span>
                          <span className="sr-only">
                            {item.done
                              ? u.completion.doneLabel
                              : u.completion.missingLabel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 2. Attached files */}
                  <div className="border-t border-ink-700 pt-2">
                    <p className="mb-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {u.filesHeading}
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
                          analysisFallbackLine={u.fileReviewChip}
                          labels={labels.attachmentsUploader}
                          extractionReadinessLabels={u.extractionReadiness}
                        />
                      </>
                    )}
                  </div>

                  {/* Derived activity timeline — real timestamps + status only. */}
                  <div
                    className="flex flex-col gap-1 border-t border-ink-700 pt-2"
                    data-testid={`buyer-request-timeline-${r.id}`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {u.timeline.heading}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {timeline.map((event, idx) => (
                        <li
                          key={`${event.key}-${idx}`}
                          className="flex items-center gap-2 text-[11px]"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue/70"
                          />
                          <span className="text-text-secondary">
                            {u.timeline.events[event.key]}
                            {event.key === "file_attached" && event.count
                              ? ` (${event.count})`
                              : ""}
                          </span>
                          {event.at ? (
                            <span className="font-mono text-[10px] text-text-muted">
                              {event.at.slice(0, 10)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* 3. Honest understanding message */}
                  <p
                    className="rounded-md border border-ink-700 bg-surface-1 px-3 py-2 text-[11px] text-text-secondary"
                    data-testid={`buyer-request-honest-${r.id}`}
                  >
                    {u.honestMessage}
                  </p>

                  {/* 4 + 5. Readiness + single next action */}
                  <div
                    className="rounded-md border border-brand-blue/40 bg-brand-blue/10 px-3 py-2"
                    data-testid={`buyer-request-next-action-${r.id}`}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-label text-brand-blue">
                      {u.nextActionHeading}
                    </p>
                    <p className="text-xs font-semibold text-text-primary">
                      {u.nextAction[readiness.nextAction]}
                    </p>
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
