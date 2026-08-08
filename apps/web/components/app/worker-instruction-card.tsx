"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import { requestInstructionClarificationAction } from "@/lib/instructions/actions";
import type { WorkerInstruction } from "@/lib/instructions/instructions";
import { formatUtcDateTime } from "@/lib/time/display";

/**
 * Worker view of a single work instruction (slice work-instructions-v1).
 *
 * The ORIGINAL is always preserved and viewable. When a real stored translation
 * exists it is shown first, labelled honestly as a DRAFT translation that must
 * be checked against the original (no "automatic translation" claim — no
 * translation engine exists); otherwise we show the original and an HONEST
 * "translation not ready yet" state — never a fake translation. The worker can
 * always reveal the original and ask the manager to clarify (a real reply in
 * the same thread).
 */

export interface InstructionCardLabels {
  autoTranslation: string;
  translationUnavailable: string;
  showOriginal: string;
  hideOriginal: string;
  originalLabel: string;
  originalLanguagePrefix: string;
  clarify: string;
  clarifyBody: string;
  clarifySent: string;
  clarifySending: string;
  clarifyError: string;
  clarifyViewThread: string;
  safetyNote: string;
  helpLine: string;
}

export function WorkerInstructionCard({
  instruction,
  labels,
}: {
  instruction: WorkerInstruction;
  labels: InstructionCardLabels;
}) {
  const locale = useLocale();
  const hasTranslation =
    instruction.translationStatus === "available" &&
    !!instruction.translatedText;
  const [showOriginal, setShowOriginal] = useState(!hasTranslation);
  const [pending, start] = useTransition();
  const [clarified, setClarified] = useState(false);
  const [clarifyFailed, setClarifyFailed] = useState(false);

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="worker-instruction-card"
      data-translation={instruction.translationStatus}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-text-primary">
          {instruction.authorName ?? "—"}
        </span>
        <span className="font-mono text-meta text-text-muted">
          {formatUtcDateTime(instruction.createdAt, locale)}
        </span>
      </div>

      {/* Primary reading surface: real translation if present, else honest state. */}
      {hasTranslation ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-meta uppercase tracking-label text-brand-cyan">
            {labels.autoTranslation}
          </span>
          <p className="text-sm leading-relaxed text-text-primary">
            {instruction.translatedText}
          </p>
        </div>
      ) : (
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="instruction-translation-unavailable"
        >
          {labels.translationUnavailable}
        </p>
      )}

      {/* The original is always available. */}
      <button
        type="button"
        onClick={() => setShowOriginal((v) => !v)}
        aria-expanded={showOriginal}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue"
        data-testid="instruction-show-original"
      >
        {showOriginal ? labels.hideOriginal : labels.showOriginal}
      </button>
      {showOriginal && (
        <div
          className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/50 p-3"
          data-testid="instruction-original"
        >
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {labels.originalLabel}
            {instruction.originalLanguage
              ? ` · ${labels.originalLanguagePrefix} ${instruction.originalLanguage.toUpperCase()}`
              : ""}
          </span>
          <p className="text-sm leading-relaxed text-text-primary">
            {instruction.originalText}
          </p>
        </div>
      )}

      <p className="text-meta leading-relaxed text-text-muted">
        {labels.safetyNote}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || clarified}
          onClick={() =>
            start(async () => {
              setClarifyFailed(false);
              const r = await requestInstructionClarificationAction(
                instruction.conversationId,
                labels.clarifyBody,
              );
              // Never a silent no-op (audit PR4): failure states its outcome;
              // success links the thread where the manager's reply will land.
              if (r.ok) setClarified(true);
              else setClarifyFailed(true);
            })
          }
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-brand-orange/40 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-orange"
          data-testid="instruction-clarify"
        >
          {clarified
            ? labels.clarifySent
            : pending
              ? labels.clarifySending
              : labels.clarify}
        </button>
        {clarified && (
          <Link
            href={`/dashboard/communication/${instruction.conversationId}` as "/dashboard"}
            className="text-xs font-medium text-brand-blue hover:underline"
            data-testid="instruction-clarify-thread-link"
          >
            {labels.clarifyViewThread} →
          </Link>
        )}
        <span className="text-meta text-text-muted">{labels.helpLine}</span>
      </div>
      {clarifyFailed && (
        <p
          role="alert"
          className="text-xs text-state-warning"
          data-testid="instruction-clarify-error"
        >
          {labels.clarifyError}
        </p>
      )}
    </section>
  );
}
