"use client";

import { useState, useTransition } from "react";

import { translateVacancyAction } from "@/lib/vacancy-store/vacancy-translation-action";
import type { TranslateVacancyActionResultV1 } from "@/lib/vacancy-store/vacancy-translation-contract";

/**
 * "TRANSLATE THIS ADVERTISEMENT" — the reader's explicit act (owner decision
 * 2026-09-22).
 *
 * THE ORIGINAL NEVER LEAVES THE PAGE. This control ADDS a rendering above
 * the publisher's words; it never replaces them, never hides them behind a
 * toggle the reader has to find, and never removes the source-language line.
 * A person who translates and a person who does not are looking at the same
 * advertisement, and the publisher's text stays the fact on screen.
 *
 * EVERY FAILURE IS NAMED IN ORDINARY WORDS. There is no provider today (the
 * egress gate refuses the task without an owner grant), so the common answer
 * is "could not be translated right now" — said plainly, with the ad still
 * fully readable underneath. No spinner that never resolves, no silent
 * no-op, no technical enum on screen.
 *
 * THE ALLOWANCE IS SHOWN ONLY WHEN IT IS KNOWN AND REAL. While payments are
 * off the server counts honestly but does not enforce, so a remaining figure
 * is rendered only when the server actually returned one. An unknown count
 * renders nothing rather than a comforting number (SEP-7: UNKNOWN ≠ ZERO).
 */
export interface VacancyTranslateLabels {
  readonly translate: string;
  readonly translating: string;
  readonly machineNote: string;
  readonly remaining: (count: number, limit: number) => string;
  readonly exhausted: (limit: number) => string;
  readonly unavailable: string;
  readonly signedOut: string;
}

export function VacancyTranslateControl({
  vacancyId,
  labels,
  descriptionHeading,
}: {
  readonly vacancyId: string;
  readonly labels: VacancyTranslateLabels;
  readonly descriptionHeading: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TranslateVacancyActionResultV1 | null>(null);

  const rendering = result?.kind === "ready" ? result : null;

  function request() {
    startTransition(async () => {
      setResult(await translateVacancyAction(vacancyId));
    });
  }

  return (
    <section className="mt-6" data-testid="vacancy-translate">
      {rendering === null && (
        <button
          type="button"
          onClick={request}
          disabled={pending}
          data-testid="vacancy-translate-button"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-muted disabled:opacity-60"
        >
          {pending ? labels.translating : labels.translate}
        </button>
      )}

      {/* WHY NOT, in words. Each branch keeps the advertisement readable. */}
      {result && result.kind !== "ready" && (
        <p className="mt-2 text-meta text-text-muted" data-testid="vacancy-translate-note">
          {result.kind === "signed_out"
            ? labels.signedOut
            : result.kind === "over_allowance" && typeof result.limit === "number"
              ? labels.exhausted(result.limit)
              : labels.unavailable}
        </p>
      )}

      {rendering && (
        <div data-testid="vacancy-translate-result">
          {rendering.title && (
            <p
              className="text-lg font-semibold tracking-tight"
              lang={rendering.targetLocale}
              data-testid="vacancy-translate-title"
            >
              {rendering.title}
            </p>
          )}
          {rendering.description && (
            <>
              <h2 className="mt-4 text-base font-medium">{descriptionHeading}</h2>
              <p
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-muted"
                lang={rendering.targetLocale}
                data-testid="vacancy-translate-description"
              >
                {rendering.description}
              </p>
            </>
          )}
          {/* A rendering is always named as a rendering. */}
          <p className="mt-2 text-meta text-text-muted">{labels.machineNote}</p>
        </div>
      )}

      {/* The figure, only when the server actually knew it. */}
      {result &&
        typeof result.remaining === "number" &&
        typeof result.limit === "number" &&
        result.kind !== "over_allowance" && (
          <p className="mt-2 text-meta text-text-muted" data-testid="vacancy-translate-allowance">
            {labels.remaining(result.remaining, result.limit)}
          </p>
        )}
    </section>
  );
}

/** The reader's own language, named in the reader's own language. */
export function displayLanguageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
