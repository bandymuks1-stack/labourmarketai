"use client";

import { useState, useTransition } from "react";

import { requestInstructionClarificationAction } from "@/lib/instructions/actions";
import type { WorkerInstruction } from "@/lib/instructions/instructions";

/**
 * Worker view of a single work instruction (slice work-instructions-v1).
 *
 * The ORIGINAL is always preserved and viewable. When a real translation exists
 * it is shown first, clearly labelled "Automatinis vertimas"; otherwise we show
 * the original and an HONEST "translation not ready yet" state — never a fake
 * translation. The worker can always reveal the original and ask the manager to
 * clarify (a real reply in the same thread).
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
  const hasTranslation =
    instruction.translationStatus === "available" &&
    !!instruction.translatedText;
  const [showOriginal, setShowOriginal] = useState(!hasTranslation);
  const [pending, start] = useTransition();
  const [clarified, setClarified] = useState(false);

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
        <span className="font-mono text-[10px] text-text-muted">
          {new Date(instruction.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Primary reading surface: real translation if present, else honest state. */}
      {hasTranslation ? (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
            {labels.autoTranslation}
          </span>
          <p className="text-sm leading-relaxed text-text-primary">
            {instruction.translatedText}
          </p>
        </div>
      ) : (
        <p
          className="text-[11px] leading-relaxed text-text-muted"
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
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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

      <p className="text-[11px] leading-relaxed text-text-muted">
        {labels.safetyNote}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || clarified}
          onClick={() =>
            start(async () => {
              const r = await requestInstructionClarificationAction(
                instruction.conversationId,
                labels.clarifyBody,
              );
              if (r.ok) setClarified(true);
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
        <span className="text-[11px] text-text-muted">{labels.helpLine}</span>
      </div>
    </section>
  );
}
