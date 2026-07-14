import Link from "next/link";

import type {
  IntelligenceCardState,
  IntelligenceSourceBadge,
} from "@/lib/intelligence/intelligence-view-model";

/**
 * Compact CONTEXTUAL intelligence card (Labour Market Intelligence v1) —
 * embedded by existing flows (worker opportunities board, company workforce
 * planning) to surface ONE headline signal in place, linking to the full
 * /dashboard/intelligence workspace.
 *
 * Pure presenter: NO fetching, NO computation here — the host page calls the
 * server read layer (lib/intelligence/intelligence-read.ts), builds/translates
 * the headline and passes everything in as props. An honest state chip always
 * renders (ready / insufficient_data / needs_migration / stale), and when a
 * source badge is supplied its origin kind stays visually distinct
 * (external ≠ internal — doctrine).
 */

const STATE_TONE: Record<IntelligenceCardState, string> = {
  ready: "border-state-success/40 bg-state-success/10 text-state-success",
  insufficient_data: "border-ink-500 bg-ink-800/40 text-text-muted",
  needs_migration: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  stale: "border-state-amber/40 bg-state-amber/10 text-state-amber",
};

const ORIGIN_TONE: Record<IntelligenceSourceBadge["originKind"], string> = {
  internal: "border-ink-500 bg-ink-800/40 text-text-secondary",
  external: "border-brand-orange/50 bg-brand-orange/10 text-brand-orange",
  blended: "border-state-amber/50 bg-state-amber/10 text-state-amber",
};

const CHIP_CLASS =
  "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label";

export interface ContextualIntelligenceCardProps {
  locale: string;
  testId: string;
  /** Small namespace eyebrow, already translated (intelligence.contextual.eyebrow). */
  eyebrow: string;
  /** The ONE headline signal, already translated by the host page. */
  headline: string;
  state: IntelligenceCardState;
  /** Already-translated state label (intelligence.state.*). */
  stateLabel: string;
  /** Optional source badge: already-translated labels + raw origin kind. */
  badge?: {
    originKind: IntelligenceSourceBadge["originKind"];
    originLabel: string;
    sourceLabel: string;
    observedAtLabel: string | null;
  } | null;
  /** Already-translated link label (intelligence.contextual.link). */
  linkLabel: string;
}

export function ContextualIntelligenceCard({
  locale,
  testId,
  eyebrow,
  headline,
  state,
  stateLabel,
  badge,
  linkLabel,
}: ContextualIntelligenceCardProps) {
  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid={testId}
      data-state={state}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {eyebrow}
        </span>
        <span className={`${CHIP_CLASS} ${STATE_TONE[state]}`}>{stateLabel}</span>
      </div>
      <p className="text-sm font-semibold text-text-primary">{headline}</p>
      {badge ? (
        <p
          className="flex flex-wrap items-center gap-2"
          data-testid={`${testId}-badge`}
          data-origin={badge.originKind}
        >
          <span className={`${CHIP_CLASS} ${ORIGIN_TONE[badge.originKind]}`}>
            {badge.originLabel}
          </span>
          <span className="text-[11px] text-text-muted">
            {badge.sourceLabel}
            {badge.observedAtLabel ? ` · ${badge.observedAtLabel}` : ""}
          </span>
        </p>
      ) : null}
      <Link
        href={`/${locale}/dashboard/intelligence`}
        className="inline-flex w-fit items-center text-xs font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        data-testid={`${testId}-link`}
      >
        {linkLabel} →
      </Link>
    </section>
  );
}
