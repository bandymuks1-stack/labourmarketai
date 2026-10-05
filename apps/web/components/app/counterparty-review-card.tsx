"use client";

import { useActionState, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  decideCounterpartyEntry,
  type DecideActionState,
} from "@/lib/journal/counterparty-actions";
import {
  COUNTERPARTY_DECISIONS,
  COUNTERPARTY_NOTE_MAX,
  offeredDecisions,
  type CounterpartyDecision,
  type PartyRole,
  type QueueBucket,
} from "@/lib/journal/counterparty-review-model";
import { formatUtcDate } from "@/lib/time/display";

export interface CounterpartyCardView {
  entryId: string;
  bucket: QueueBucket;
  latestDecision: "approved" | "changes_requested" | "rejected" | null;
  workerName: string | null;
  projectName: string | null;
  partyRole: PartyRole | null;
  originalText: string;
  submittedAt: string | null;
  workDate: string | null;
  isResubmission: boolean;
  metrics: { label: string; value: string }[];
  hours: string | null;
  photos: { id: string; fileName: string; signedUrl: string | null }[];
  /** Decision history across the correction chain, oldest first. */
  history: {
    decision: "approved" | "changes_requested" | "rejected" | null;
    note: string | null;
    at: string | null;
  }[];
  /** False when the detail could not be read: the card says so and offers no
   *  decision it could not back with what the reviewer is meant to see. */
  detailAvailable: boolean;
}

/**
 * ONE submitted entry in the counterparty's queue.
 *
 * The representative sees the work the worker submitted - text, the hours and
 * figures recorded with it, the photos attached - and decides: ACCEPT,
 * REQUEST CORRECTION or DISPUTE, with a note (required for the last two). The
 * decision is an explicit act on a real submission; the server re-derives the
 * caller and the authority (the worker can never be their own counterparty).
 *
 * ACCEPT is final. After a correction request the party waits for the
 * worker's corrected version (it arrives as a new submission). A dispute is
 * kept in the history and can be withdrawn only by a later acceptance.
 * Nothing here is an employer confirmation, a skill verification or a
 * payment approval, and the copy says so.
 */
export function CounterpartyReviewCard({ view }: { view: CounterpartyCardView }) {
  const t = useTranslations("journal.counterparty.queue.card");
  const tRole = useTranslations("journal.counterparty.link.role");
  const tResult = useTranslations("journal.counterparty.queue.card.result");
  const locale = useLocale();
  const headingId = useId();
  const noteId = useId();
  const hintId = useId();
  const [decision, setDecision] = useState<CounterpartyDecision | null>(null);
  const [state, action, pending] = useActionState<DecideActionState | null, FormData>(
    decideCounterpartyEntry,
    null,
  );

  const offered = view.detailAvailable ? offeredDecisions(view.latestDecision) : [];
  const decidedNow = state?.ok === true;
  const showForm = offered.length > 0 && !decidedNow;
  const effective = offered.length === 1 ? offered[0] : decision;
  const noteRequired = effective !== null && effective !== "accept";
  const dateText = (iso: string | null) => (iso ? formatUtcDate(iso, locale) : null);

  return (
    <li
      className="card-border flex flex-col gap-3 p-4"
      aria-labelledby={headingId}
      data-testid={`counterparty-card-${view.entryId}`}
      data-bucket={view.bucket}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={headingId} className="break-words font-display text-sm font-semibold text-text-primary">
            {view.workerName ?? t("workerUnknown")}
          </p>
          <p className="mt-0.5 text-meta text-text-muted">
            {[
              view.projectName,
              view.partyRole ? t("yourRole", { role: tRole(view.partyRole) }) : null,
              view.workDate
                ? dateText(view.workDate)
                : view.submittedAt
                  ? t("submittedOn", { date: dateText(view.submittedAt) ?? "—" })
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <BucketBadge bucket={view.bucket} />
      </div>

      {view.isResubmission ? (
        <p className="text-meta leading-relaxed text-state-warning" data-testid={`counterparty-resubmission-${view.entryId}`}>
          {t("resubmission")}
        </p>
      ) : null}

      {view.detailAvailable ? (
        <>
          <div>
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("work")}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-primary">
              {view.originalText}
            </p>
          </div>

          {view.hours || view.metrics.length > 0 ? (
            <dl
              className="flex flex-wrap gap-x-5 gap-y-1 text-meta text-text-secondary"
              data-testid={`counterparty-figures-${view.entryId}`}
            >
              {view.hours ? (
                <div className="flex gap-1">
                  <dt className="uppercase tracking-label text-text-muted">{t("hours")}:</dt>
                  <dd>{view.hours}</dd>
                </div>
              ) : null}
              {view.metrics.map((m) => (
                <div key={m.label} className="flex gap-1">
                  <dt className="uppercase tracking-label text-text-muted">{m.label}:</dt>
                  <dd>{m.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div>
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("photos")}</p>
            {view.photos.length === 0 ? (
              <p className="mt-1 text-meta text-text-muted" data-testid={`counterparty-no-photos-${view.entryId}`}>
                {t("noPhotos")}
              </p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-2">
                {view.photos.map((p) => (
                  <li key={p.id} className="w-28">
                    {p.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private bucket
                      <img
                        src={p.signedUrl}
                        alt={p.fileName || t("photoAlt")}
                        loading="lazy"
                        className="h-20 w-28 rounded-md border border-ink-600 object-cover"
                      />
                    ) : (
                      <p className="flex h-20 w-28 items-center justify-center rounded-md border border-dashed border-ink-500 p-1 text-center text-meta text-text-muted">
                        {t("photoUnavailable")}
                      </p>
                    )}
                    {p.fileName ? (
                      <p className="mt-0.5 truncate text-meta text-text-muted">{p.fileName}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p role="alert" className="rounded-md border border-state-warning/40 bg-state-warning/10 p-3 text-sm text-text-secondary">
          {t("detailUnavailable")}
        </p>
      )}

      {view.history.length > 0 ? (
        <div data-testid={`counterparty-history-${view.entryId}`}>
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{t("history")}</p>
          <ol className="mt-1 flex flex-col gap-1">
            {view.history.map((h, i) => (
              <li key={`${h.at ?? i}-${i}`} className="text-meta leading-relaxed text-text-secondary">
                <span className="font-medium text-text-primary">
                  {h.decision ? t(`decision.${h.decision}` as never) : "—"}
                </span>
                {dateText(h.at) ? ` · ${dateText(h.at)}` : ""}
                {h.note ? ` — “${h.note}”` : ""}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {view.latestDecision === "approved" ||
      (state?.ok === true && state.decision === "approved") ? (
        <p className="text-meta leading-relaxed text-text-secondary" data-testid={`counterparty-final-${view.entryId}`}>
          {t("acceptedFinal")}
        </p>
      ) : null}
      {view.latestDecision === "changes_requested" && !decidedNow ? (
        <p className="text-meta leading-relaxed text-text-secondary" data-testid={`counterparty-waiting-${view.entryId}`}>
          {t("waitingForWorker")}
        </p>
      ) : null}

      {showForm ? (
        <form action={action} className="flex flex-col gap-3 border-t border-border/40 pt-3">
          <input type="hidden" name="entry_id" value={view.entryId} />
          <input type="hidden" name="locale" value={locale} />
          {offered.length === 1 ? (
            <>
              <input type="hidden" name="decision" value={offered[0]} />
              <p className="text-meta leading-relaxed text-text-muted">{t("withdrawDisputeHint")}</p>
            </>
          ) : (
            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("yourDecision")}
              </legend>
              {COUNTERPARTY_DECISIONS.map((d) => (
                <label
                  key={d}
                  className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border border-ink-600 px-3 py-2 text-sm text-text-primary has-[:checked]:border-brand-blue has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-blue"
                >
                  <input
                    type="radio"
                    name="decision"
                    value={d}
                    required
                    checked={decision === d}
                    onChange={() => setDecision(d)}
                    className="mt-1"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium">{t(`action.${d}` as never)}</span>
                    <span className="text-meta text-text-muted">{t(`actionHint.${d}` as never)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={noteId} className="text-meta text-text-muted">
              {noteRequired ? t("noteLabelRequired") : t("noteLabel")}
            </label>
            <textarea
              id={noteId}
              name="note"
              rows={3}
              maxLength={COUNTERPARTY_NOTE_MAX}
              required={noteRequired}
              aria-describedby={hintId}
              disabled={pending}
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-brand-blue"
            />
            <p id={hintId} className="text-meta text-text-muted">
              {t("noteHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant={effective === "accept" ? "primary" : "secondary"}
              disabled={pending || effective === null}
              aria-busy={pending || undefined}
              data-testid={`counterparty-decide-${view.entryId}`}
            >
              {pending ? t("saving") : effective ? t(`submit.${effective}` as never) : t("chooseFirst")}
            </Button>
            {effective === "accept" ? (
              <span className="text-meta text-text-muted">{t("acceptIsFinal")}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={`text-meta leading-relaxed ${state.ok ? "text-state-success" : "text-state-danger"}`}
          data-testid={`counterparty-result-${view.entryId}`}
        >
          {state.ok ? tResult(`ok.${state.decision}` as never) : tResult(state.code as never)}
        </p>
      ) : null}
    </li>
  );
}

function BucketBadge({ bucket }: { bucket: QueueBucket }) {
  const t = useTranslations("journal.counterparty.queue.bucket");
  const tone =
    bucket === "accepted"
      ? "border-state-success/40 bg-state-success/10 text-state-success"
      : bucket === "disputed"
        ? "border-state-danger/40 bg-state-danger/10 text-state-danger"
        : bucket === "waiting_for_worker"
          ? "border-state-warning/40 bg-state-warning/10 text-state-warning"
          : "border-brand-blue/40 bg-brand-blue/10 text-brand-blue";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-meta font-medium ${tone}`}>{t(bucket)}</span>
  );
}
