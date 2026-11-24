"use client";

import { useState, useTransition } from "react";

import {
  explainMarketForProfession,
  type MarketExplanationData,
  type MarketExplanationOffReason,
} from "@/lib/market/market-explanation-actions";

/**
 * "Explain this market" — the ONE control that spends a token budget.
 *
 * The deterministic facts above it are already rendered and already useful.
 * This asks a model to read them back in the visitor's language. So the
 * component's whole job is to keep two things visible that an AI feature
 * usually hides:
 *
 *   1. WHICH SENTENCES ARE GENERATED. The result is enclosed, labelled, and
 *      carries the provider and model that produced it. A paragraph with no
 *      attributable author is an anonymous claim, and this product does not
 *      make those (§7).
 *   2. THAT NOTHING WAS LOST WHEN IT IS ABSENT. Every `off` reason renders as
 *      its own honest sentence — not enabled, asked too often, market too
 *      small — never a generic error and never a silent no-op. The facts stay
 *      on screen either way.
 *
 * It is also stateless on the server: nothing here is persisted, so pressing
 * the button twice produces two readings of the same numbers and changes no
 * record.
 */
export function MarketExplanationRequest({
  professionSlug,
  locale,
  labels,
}: {
  professionSlug: string;
  locale: string;
  labels: {
    cta: string;
    pending: string;
    resultTitle: string;
    attribution: string;
    whereTitle: string;
    skillsTitle: string;
    actionsTitle: string;
    limitationsTitle: string;
    reviewNote: string;
    off: Record<MarketExplanationOffReason, string>;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { kind: "ok"; data: MarketExplanationData; attribution: string; needsReview: boolean }
    | { kind: "off"; reason: MarketExplanationOffReason }
    | null
  >(null);

  const run = () => {
    startTransition(async () => {
      const outcome = await explainMarketForProfession(professionSlug, locale);
      if (outcome.status === "ok") {
        setResult({
          kind: "ok",
          data: outcome.explanation,
          // Provider and model come from the run itself, never from a
          // hardcoded label — if routing picks a different model tomorrow the
          // attribution follows it.
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
    <div className="flex flex-col gap-3" data-testid="market-explanation-request">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex w-fit items-center rounded-md border border-ink-600 bg-ink-800/60 px-3 py-2 text-sm font-semibold text-text-primary hover:bg-ink-800 disabled:opacity-60"
      >
        {pending ? labels.pending : labels.cta}
      </button>

      {result?.kind === "off" ? (
        <p
          className="text-xs leading-relaxed text-text-secondary"
          data-testid="market-explanation-off"
        >
          {labels.off[result.reason]}
        </p>
      ) : null}

      {result?.kind === "ok" ? (
        <article
          className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/40 p-4"
          data-testid="market-explanation-result"
        >
          <header className="flex flex-col gap-1">
            <h4 className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {labels.resultTitle}
            </h4>
            {/* Attribution sits at the TOP, before the text it belongs to —
                a reader must know what they are reading before they read it. */}
            <p className="text-meta text-text-secondary">{result.attribution}</p>
          </header>

          <p className="text-sm leading-relaxed text-text-primary">
            {result.data.summary}
          </p>

          <FactList title={labels.whereTitle} items={result.data.where_demand_is} />
          <FactList title={labels.skillsTitle} items={result.data.skills_in_demand} />
          <FactList title={labels.actionsTitle} items={result.data.suggested_actions} />
          {/* Limitations are NOT collapsible and NOT optional. The agent's
              schema requires at least one, and the surface renders every one. */}
          <FactList
            title={labels.limitationsTitle}
            items={result.data.limitations}
          />

          {result.needsReview ? (
            <p className="text-xs leading-relaxed text-text-secondary">
              {labels.reviewNote}
            </p>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

function FactList({
  title,
  items,
}: {
  title: string;
  items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <h5 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {title}
      </h5>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-text-primary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
