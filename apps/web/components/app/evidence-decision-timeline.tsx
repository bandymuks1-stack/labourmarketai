import { getTranslations } from "next-intl/server";
import type { ReviewTimelineEvent } from "@/lib/journal/review-status";
import type { CorrectionProvenanceStep } from "@/lib/journal/correction-provenance";

/**
 * Evidence Decision Timeline (v1). A compact, honest history of what actually
 * happened to a journal entry, built ONLY from data the app already stores:
 *   - "Record created"   — the entry's own created_at (always real).
 *   - "Waiting for human confirmation" — shown ONLY while there is no human
 *     decision yet (no evidence row). Never claims AI/automatic verification.
 *   - one step per REAL decision row (append-only), in order:
 *       approved          → "Confirmed"      (only with a real approved row)
 *       changes_requested → "Changes requested"
 *       rejected          → "Not confirmed"
 *     each with the confirmer ROLE (manager / owner / external (client)
 *     manager — the only roles the backend can store) and the date.
 *   - a decision's REAL reason note, shown only when one was actually given.
 *
 * No score, no fake step, no fabricated reason, no broad confirmer. The events
 * are derived by `deriveReviewTimeline`; this component only presents them.
 */

const DOT: Record<ReviewTimelineEvent["result"] | "created" | "waiting", string> = {
  created: "bg-text-muted",
  // Waiting for a review is a normal state, not a warning: a hollow neutral dot.
  waiting: "border border-text-muted bg-transparent",
  approved: "bg-state-success",
  changes_requested: "bg-state-warning",
  rejected: "bg-state-danger",
};

const TEXT: Record<ReviewTimelineEvent["result"], string> = {
  approved: "text-state-success",
  changes_requested: "text-state-warning",
  rejected: "text-state-danger",
};

const SUPPORTED_ROLES = ["manager", "owner", "external_manager"] as const;

/** A real note longer than this is shortened on the card's face; the full
 *  note is always in the timeline behind the card's "more" disclosure. */
const INLINE_NOTE_MAX = 120;

/**
 * WHAT THIS CORRECTION ANSWERED — one short line on the face of a correction's
 * card (walk work-verification 2026-10-25): "Corrected after it was returned
 * · 2026-10-25 · “the manager's note”". Built only from the decided original's
 * real decision row (`deriveCorrectionProvenance`); it is provenance, not a
 * state — the card's evidence chip stays the correction's own. A long note is
 * shortened here and read in full in the timeline. Nothing to say → nothing.
 */
export async function CorrectionProvenanceLine({
  entryId,
  steps,
}: {
  entryId: string;
  steps: readonly CorrectionProvenanceStep[] | undefined;
}) {
  const nearest = steps?.[0];
  if (!nearest) return null;
  const t = await getTranslations("journal");
  const tTier = await getTranslations("evidenceTier");
  const note =
    nearest.note && nearest.note.length > INLINE_NOTE_MAX
      ? `${nearest.note.slice(0, INLINE_NOTE_MAX).trimEnd()}…`
      : nearest.note;
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-1.5 text-meta leading-relaxed text-text-muted"
      data-testid={`journal-entry-corrected-from-${entryId}`}
      data-result={nearest.result}
      data-automatic={nearest.automatic ? "true" : undefined}
    >
      <span className={`font-medium ${TEXT[nearest.result]}`}>
        {t(`entry.timeline.correctedFrom.${nearest.result}`)}
      </span>
      {/* An automatic confirmation never reads like a hand one (W6). */}
      {nearest.automatic ? (
        <span data-testid="corrected-from-auto-confirm-qualifier">
          · {tTier("autoConfirmQualifier")}
        </span>
      ) : null}
      {nearest.at ? (
        <span className="font-mono text-meta">· {nearest.at.slice(0, 10)}</span>
      ) : null}
      {note ? (
        <span className="min-w-0 break-words text-text-secondary">
          · {t("entry.timeline.quotedNote", { note })}
        </span>
      ) : null}
    </p>
  );
}

export async function EvidenceDecisionTimeline({
  createdAt,
  events,
  awaiting,
  correctedFrom,
}: {
  createdAt: string;
  events: readonly ReviewTimelineEvent[];
  /** False when the organisation has not switched confirmation on: the entry
   *  is NOT in anyone's queue, so "waiting for a human" would be untrue. */
  awaiting?: boolean;
  /** This entry is a correction: the decisions it answered, nearest first
   *  (`deriveCorrectionProvenance`). Shown BEFORE "record created" — they
   *  happened to the earlier version, before this one existed — with the
   *  reviewer's role, date and real note. History, not this entry's state:
   *  `events` (this entry's own decisions) is unchanged by it. */
  correctedFrom?: readonly CorrectionProvenanceStep[];
}) {
  const t = await getTranslations("journal");
  const tTier = await getTranslations("evidenceTier");
  // Oldest first, like the rest of the timeline.
  const earlier = [...(correctedFrom ?? [])].reverse();

  return (
    <ol
      className="mt-2 flex flex-col gap-1.5 border-l border-border pl-3"
      data-testid="evidence-decision-timeline"
      aria-label={t("entry.timeline.title")}
    >
      {earlier.map((step) => {
        const roleLabel =
          step.role && (SUPPORTED_ROLES as readonly string[]).includes(step.role)
            ? t(`entry.confirmerRole.${step.role}`)
            : null;
        return (
          <li
            key={`corrected-from-${step.originalId}`}
            className="flex items-start gap-2"
            data-step="corrected-from"
            data-result={step.result}
          >
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[step.result]}`}
              aria-hidden
            />
            <span className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-meta leading-tight">
                <span className={`font-medium ${TEXT[step.result]}`}>
                  {t(`entry.timeline.correctedFrom.${step.result}`)}
                </span>
                {roleLabel ? (
                  <span className="text-text-muted">
                    · {t("entry.reviewedBy")} {roleLabel}
                  </span>
                ) : null}
                {step.automatic ? (
                  <span
                    className="text-text-muted"
                    data-testid="timeline-auto-confirm-qualifier"
                  >
                    · {tTier("autoConfirmQualifier")}
                  </span>
                ) : null}
                {step.at ? (
                  <span className="font-mono text-meta text-text-muted">
                    · {step.at.slice(0, 10)}
                  </span>
                ) : null}
              </span>
              {step.note ? (
                <span className="text-meta leading-relaxed text-text-secondary break-words">
                  {t("entry.timeline.reasonLabel")}:{" "}
                  {t("entry.timeline.quotedNote", { note: step.note })}
                </span>
              ) : null}
              <span className="text-meta leading-relaxed text-text-muted">
                {t("entry.timeline.correctedFrom.earlierVersion")}
              </span>
            </span>
          </li>
        );
      })}
      {/* Record created — always real (the entry's own timestamp). */}
      <li className="flex items-start gap-2" data-step="created">
        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT.created}`} aria-hidden />
        <span className="flex flex-wrap items-baseline gap-x-1.5 text-meta leading-tight text-text-secondary">
          <span>{t("entry.timeline.created")}</span>
          <span className="font-mono text-meta text-text-muted">
            {createdAt.slice(0, 10)}
          </span>
        </span>
      </li>

      {events.length === 0 && awaiting === false ? (
        <li className="flex items-start gap-2" data-step="not-enabled">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT.waiting}`} aria-hidden />
          <span className="text-meta leading-tight text-text-muted">
            {t("entry.timeline.notEnabled")}
          </span>
        </li>
      ) : events.length === 0 ? (
        /* No human decision yet — honestly "waiting", never auto-confirmed. */
        <li className="flex items-start gap-2" data-step="waiting">
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT.waiting}`} aria-hidden />
          <span className="text-meta leading-tight text-text-secondary">
            {t("entry.timeline.waiting")}
          </span>
        </li>
      ) : (
        events.map((ev, i) => {
          const roleLabel =
            ev.role && (SUPPORTED_ROLES as readonly string[]).includes(ev.role)
              ? t(`entry.confirmerRole.${ev.role}`)
              : null;
          return (
            <li
              key={`${ev.at ?? "na"}-${i}`}
              className="flex items-start gap-2"
              data-step={ev.result}
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[ev.result]}`}
                aria-hidden
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-baseline gap-x-1.5 text-meta leading-tight">
                  <span className={`font-medium ${TEXT[ev.result]}`}>
                    {t(`entry.timeline.${ev.result}`)}
                  </span>
                  {roleLabel ? (
                    <span className="text-text-muted">
                      · {t("entry.reviewedBy")} {roleLabel}
                    </span>
                  ) : null}
                  {/* W6 slice 1: an automatic confirmation never looks
                      identical to a hand one — small, factual qualifier. */}
                  {ev.automatic ? (
                    <span
                      className="text-text-muted"
                      data-testid="timeline-auto-confirm-qualifier"
                    >
                      · {tTier("autoConfirmQualifier")}
                    </span>
                  ) : null}
                  {ev.at ? (
                    <span className="font-mono text-meta text-text-muted">
                      · {ev.at.slice(0, 10)}
                    </span>
                  ) : null}
                </span>
                {/* Real reason only — rendered solely when a note actually
                    exists; never a default/fabricated reason. */}
                {ev.note ? (
                  <span className="text-meta leading-relaxed text-text-secondary break-words">
                    {t("entry.timeline.reasonLabel")}: {ev.note}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })
      )}
    </ol>
  );
}
