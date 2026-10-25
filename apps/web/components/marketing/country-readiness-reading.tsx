"use client";

import { useId, useState, useTransition } from "react";

import {
  explainCountryReadiness,
  type CountryReadingOffReason,
} from "@/lib/country-readiness/readiness-reading-actions";
import type { CountryReading } from "@/lib/country-readiness/readiness-reading";

/**
 * "Explain this in plain language" — the country page's ONE control that can
 * spend a token budget (owner decision 2026-10-25, registry row 10.11).
 *
 * It sits BELOW the matrix, never above it: every requirement, its source and
 * its review date are already on screen and already complete. This asks a
 * model to read one scope's rows back as a short ordered explanation. So the
 * component keeps visible the two things an AI feature usually hides:
 *
 *   1. WHICH SENTENCES ARE GENERATED. The reading is enclosed, labelled as a
 *      suggestion, attributed to the provider and model that wrote it, and
 *      every step shows the official source of the matrix row it cites —
 *      resolved from the matrix, not from the model.
 *   2. THAT NOTHING WAS LOST WHEN IT IS ABSENT. Every `off` reason is its own
 *      honest sentence — AI switched off, sign in, asked too often, a cited
 *      requirement that does not exist — and the matrix stays on screen.
 *
 * Stateless: nothing is persisted, so asking twice changes no record.
 */
export function CountryReadinessReading({
  country,
  locale,
  scopes,
  labels,
}: {
  country: string;
  locale: string;
  scopes: readonly { value: string; label: string }[];
  labels: {
    title: string;
    intro: string;
    scopeLabel: string;
    cta: string;
    pending: string;
    resultTitle: string;
    attribution: string;
    stepsTitle: string;
    stepSource: string;
    stepLegalCheck: string;
    legalCheck: string;
    limitationsTitle: string;
    reviewNote: string;
    off: Record<CountryReadingOffReason, string>;
  };
}) {
  const selectId = useId();
  const [scope, setScope] = useState(scopes[0]?.value ?? "");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: "ok"; reading: CountryReading; attribution: string; needsReview: boolean }
    | { kind: "off"; reason: CountryReadingOffReason }
    | null
  >(null);

  const run = () => {
    startTransition(async () => {
      const outcome = await explainCountryReadiness(country, scope, locale);
      if (outcome.status === "ok") {
        setResult({
          kind: "ok",
          reading: outcome.reading,
          // From the run itself, never a hardcoded label.
          attribution: labels.attribution
            .replace("{provider}", outcome.provider)
            .replace("{model}", outcome.model),
          needsReview: outcome.needsHumanReview,
        });
      } else {
        setResult({ kind: "off", reason: outcome.reason });
      }
    });
  };

  return (
    <section
      className="mt-10 flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-1 p-5"
      data-testid="country-readiness-reading"
    >
      <h3 className="font-display text-lg font-semibold text-text-primary">
        {labels.title}
      </h3>
      <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
        {labels.intro}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 text-meta text-text-secondary" htmlFor={selectId}>
          {labels.scopeLabel}
          <select
            id={selectId}
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setResult(null);
            }}
            className="min-w-0 max-w-full rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary"
          >
            {scopes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={pending || scope === ""}
          className="inline-flex w-fit items-center rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-1 disabled:opacity-60"
        >
          {pending ? labels.pending : labels.cta}
        </button>
      </div>

      {result?.kind === "off" ? (
        <p
          className="text-xs leading-relaxed text-text-secondary"
          data-testid="country-readiness-reading-off"
          data-reason={result.reason}
          role="status"
        >
          {labels.off[result.reason]}
        </p>
      ) : null}

      {result?.kind === "ok" ? (
        <article
          className="flex flex-col gap-3 rounded-md border border-dashed border-border-subtle bg-surface-2 p-4"
          data-testid="country-readiness-reading-result"
        >
          <header className="flex flex-col gap-1">
            <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {labels.resultTitle}
            </h4>
            {/* Attribution BEFORE the text it belongs to. */}
            <p className="text-meta text-text-secondary">{result.attribution}</p>
          </header>

          <p className="text-sm leading-relaxed text-text-primary">
            {result.reading.summary}
          </p>

          {result.reading.needsLegalCheck ? (
            <p className="rounded-md border border-dashed border-border-subtle p-3 text-xs leading-relaxed text-text-secondary">
              {labels.legalCheck}
            </p>
          ) : null}

          <section className="flex flex-col gap-2">
            <h5 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {labels.stepsTitle}
            </h5>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-text-primary">
              {result.reading.steps.map((s) => (
                <li key={s.ref} data-cites={s.ref}>
                  <span>{s.text}</span>{" "}
                  <span className="text-meta text-text-muted">
                    {labels.stepSource}{" "}
                    <a
                      href={s.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-brand-blue hover:text-brand-champagne"
                    >
                      {s.sourceTitle}
                    </a>
                    {s.needsLegalCheck ? ` · ${labels.stepLegalCheck}` : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* Limitations are not optional: the schema requires at least one. */}
          <section className="flex flex-col gap-1">
            <h5 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {labels.limitationsTitle}
            </h5>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-text-primary">
              {result.reading.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>

          {result.needsReview ? (
            <p className="text-xs leading-relaxed text-text-secondary">{labels.reviewNote}</p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
