"use client";

import { useActionState, useId } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  submitEntryForReview,
  type SubmitActionState,
} from "@/lib/journal/counterparty-actions";
import type {
  EntryReviewPhase,
  EntryReviewState,
} from "@/lib/journal/counterparty-review-model";
import { formatUtcDate } from "@/lib/time/display";

/**
 * THE WORKER'S JOURNAL ENTRY - "Client review".
 *
 * The subject's side of the counterparty journey: they explicitly SUBMIT an
 * entry to the legitimate counterparty of THEIR OWN work relationship (a
 * client / customer registered by that party's own representative from a real
 * project assignment). Nothing is ever submitted automatically, and the
 * subject can never act as their own counterparty: the submit action only
 * resolves among the links the database says are valid for this entry.
 *
 * The state is read back from the database (`entry_review_states_v1`):
 * recorded / submitted / accepted / correction requested / disputed. An
 * acceptance is shown as the CLIENT's acceptance - never as an employer
 * confirmation, a skill verification or a payment record. After a correction
 * request the way forward is the existing journal correction (a new version
 * linked by `correction_of`) and then "Resubmit".
 *
 * The employer review path is untouched and lives elsewhere.
 */
export function EntryReviewPanel({
  entryId,
  phase,
  state,
  resubmission,
  correctSlot,
}: {
  entryId: string;
  phase: Exclude<EntryReviewPhase, "none">;
  state: EntryReviewState;
  /** This entry is the corrected version of an entry that was submitted. */
  resubmission: boolean;
  /** The existing journal correction control (edit launcher), offered when the
   *  counterparty asked for a correction or disputed the entry. */
  correctSlot?: React.ReactNode;
}) {
  const t = useTranslations("journal.counterparty.entry");
  const tRole = useTranslations("journal.counterparty.link.role");
  const locale = useLocale();
  const headingId = useId();
  const selectId = useId();
  const [result, action, pending] = useActionState<SubmitActionState | null, FormData>(
    submitEntryForReview,
    null,
  );

  const party = state.submission?.partyName ?? t("partyUnknown");
  const roleText = state.submission?.partyRole ? tRole(state.submission.partyRole) : null;
  const partyLine = roleText ? `${party} (${roleText})` : party;
  const when = (iso: string | null) => (iso ? formatUtcDate(iso, locale) : null);

  const submittedNow = result?.ok === true;
  const effectivePhase: EntryReviewPhase =
    phase === "ready_to_submit" && submittedNow ? "submitted" : phase;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-ink-600 bg-ink-800/30 p-3"
      aria-labelledby={headingId}
      data-testid={`entry-review-${entryId}`}
      data-phase={effectivePhase}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id={headingId}
          className="font-mono text-meta uppercase tracking-label text-text-muted"
        >
          {t("title")}
        </h3>
        <PhaseBadge phase={effectivePhase} />
      </div>

      {effectivePhase === "ready_to_submit" ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="entry_id" value={entryId} />
          <input type="hidden" name="locale" value={locale} />
          <p className="text-xs leading-relaxed text-text-secondary">
            {resubmission ? t("resubmitLead") : t("submitLead")}
          </p>
          {state.candidates.length > 1 ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={selectId} className="text-meta text-text-muted">
                {t("pickParty")}
              </label>
              <Select id={selectId} name="link_id" required disabled={pending} defaultValue="">
                <option value="" disabled>
                  {t("pickPartyPlaceholder")}
                </option>
                {state.candidates.map((c) => (
                  <option key={c.linkId} value={c.linkId}>
                    {c.partyName ?? t("partyUnknown")}
                    {c.partyRole ? ` (${tRole(c.partyRole)})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <>
              <input type="hidden" name="link_id" value={state.candidates[0]?.linkId ?? ""} />
              <p className="text-xs text-text-primary">
                {t("willGoTo", {
                  party: `${state.candidates[0]?.partyName ?? t("partyUnknown")}${
                    state.candidates[0]?.partyRole ? ` (${tRole(state.candidates[0].partyRole)})` : ""
                  }`,
                })}
              </p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={pending}
              aria-busy={pending || undefined}
              data-testid={`entry-review-submit-${entryId}`}
            >
              {pending ? t("submitting") : resubmission ? t("resubmit") : t("submit")}
            </Button>
            <span className="text-meta text-text-muted">{t("neverAutomatic")}</span>
          </div>
        </form>
      ) : null}

      {effectivePhase === "submitted" ? (
        <p className="text-xs leading-relaxed text-text-secondary" data-testid={`entry-review-submitted-${entryId}`}>
          {state.submission
            ? t("submittedTo", { party: partyLine, date: when(state.submission.submittedAt) ?? "—" })
            : t("submittedGeneric")}{" "}
          {t("awaiting")}
          {state.submission?.resubmissionOfEntryId ? ` ${t("isResubmission")}` : ""}
        </p>
      ) : null}

      {effectivePhase === "accepted" ? (
        <div className="flex flex-col gap-1" data-testid={`entry-review-accepted-${entryId}`}>
          <p className="text-xs leading-relaxed text-text-primary">
            {t("acceptedBy", { party: partyLine, date: when(state.latest?.at ?? null) ?? "—" })}
          </p>
          {state.latest?.note ? (
            <p className="break-words text-meta text-text-secondary">
              {t("theirNote")}: “{state.latest.note}”
            </p>
          ) : null}
          <p className="text-meta leading-relaxed text-text-muted">{t("acceptedNotEmployer")}</p>
        </div>
      ) : null}

      {effectivePhase === "correction_requested" || effectivePhase === "disputed" ? (
        <div
          className="flex flex-col gap-2"
          data-testid={`entry-review-${effectivePhase === "disputed" ? "disputed" : "correction"}-${entryId}`}
        >
          <p className="text-xs leading-relaxed text-text-primary">
            {effectivePhase === "disputed"
              ? t("disputedBy", { party: partyLine, date: when(state.latest?.at ?? null) ?? "—" })
              : t("correctionRequestedBy", {
                  party: partyLine,
                  date: when(state.latest?.at ?? null) ?? "—",
                })}
          </p>
          {state.latest?.note ? (
            <p className="break-words rounded-md border border-ink-600 px-3 py-2 text-xs text-text-secondary">
              {t("theirNote")}: “{state.latest.note}”
            </p>
          ) : null}
          <p className="text-meta leading-relaxed text-text-muted">
            {effectivePhase === "disputed" ? t("disputedHint") : t("correctionHint")}
          </p>
          {correctSlot ? <div className="flex flex-wrap items-center gap-2">{correctSlot}</div> : null}
        </div>
      ) : null}

      {result?.ok ? (
        <p
          role="status"
          className="text-meta leading-relaxed text-state-success"
          data-testid={`entry-review-result-${entryId}`}
        >
          {t(`result.${result.code}` as never)}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p
          role="alert"
          className="text-meta leading-relaxed text-state-danger"
          data-testid={`entry-review-result-${entryId}`}
        >
          {t(`result.${result.code}` as never)}
        </p>
      ) : null}
    </section>
  );
}

function PhaseBadge({ phase }: { phase: EntryReviewPhase }) {
  const t = useTranslations("journal.counterparty.entry.phase");
  if (phase === "none") return null;
  const tone =
    phase === "accepted"
      ? "border-state-success/40 bg-state-success/10 text-state-success"
      : phase === "disputed"
        ? "border-state-danger/40 bg-state-danger/10 text-state-danger"
        : phase === "correction_requested"
          ? "border-state-warning/40 bg-state-warning/10 text-state-warning"
          : "border-ink-500 text-text-secondary";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-meta font-medium ${tone}`}
      data-testid="entry-review-phase"
    >
      {t(phase)}
    </span>
  );
}
