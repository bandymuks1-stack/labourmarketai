"use client";

import { useMemo } from "react";

import {
  EvidenceLabelResolveForm,
  EvidenceTimeSemanticsForm,
  type LabelResolveLabels,
  type Option,
  type TimeSemanticsLabels,
} from "@/components/app/evidence-import-forms";
import { SemanticIcon } from "@/components/app/semantic-icon";
import {
  playerInitials,
  PLAYER_IDENTITY_AVATAR_BORDER,
  PLAYER_IDENTITY_FALLBACK_SURFACE,
} from "@/lib/identity/player-identity";
import type { EvidenceImportActionState } from "@/lib/organization-evidence/import-actions";
import type { IssueProjection } from "@/lib/organization-evidence/import-projections";
import { cn } from "@/lib/utils";

/**
 * ATTENTION — only what needs a human, and nothing else
 * (LABOURMARKET_VISUAL_FIRST constitution 2026-09-16 §Z–§AA, §BH).
 *
 * A DECISION is a compact object: the person's identity, the figure, what
 * the system detected (PERIOD TOTAL / ?), remote (✓ ✕ ?), period (? or the
 * dates) and the one control that settles it — the existing time-semantics
 * form, unchanged. The source's words are one click away, the reasoning one
 * more. The 800 / 165 case is exactly this: the owner's own knowledge (a
 * work-from-home aggregate over months) is entered HERE, by the human, and
 * never assumed by the code; the period stays UNKNOWN unless typed.
 *
 * Observations that do not block (a place read from the text, an unknown
 * split, an unnamed site) are tokens with a count; their sentences open on
 * request. Read-only apart from the existing staging-only forms.
 */

type Action = (prev: EvidenceImportActionState, form: FormData) => Promise<EvidenceImportActionState>;

export interface AttentionLabels {
  readonly decisions: string;
  readonly observations: string;
  readonly none: string;
  readonly issue: (kind: string, values: { count: number; label: string }) => string;
  readonly why: (kind: string) => string;
  readonly detected: string;
  readonly machineReading: { readonly period_aggregate: string; readonly unknown: string };
  readonly remote: string;
  readonly period: string;
  readonly unknown: string;
  readonly source: string;
  readonly whyLabel: string;
  readonly person: string;
  readonly sum: string;
  readonly time: TimeSemanticsLabels;
  readonly label: LabelResolveLabels;
}

const TILE = cn("flex shrink-0 items-center justify-center rounded-full font-display font-semibold", PLAYER_IDENTITY_AVATAR_BORDER, PLAYER_IDENTITY_FALLBACK_SURFACE);
const TOKEN = "inline-flex items-center gap-1 rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label";

export function HistoricalAttention({
  issues,
  sessionId,
  locale,
  labels,
  workObjects,
  actions,
}: {
  issues: readonly IssueProjection[];
  sessionId: string;
  locale: string;
  labels: AttentionLabels;
  workObjects: readonly Option[];
  actions: { readonly resolveLabel: Action; readonly resolveTime: Action };
}) {
  const fmt = useMemo(() => {
    const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
    const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: locale === "lt" ? "long" : "short", timeZone: "UTC" });
    return { hours: (n: number) => num.format(n), day: (iso: string) => day.format(new Date(`${iso}T00:00:00Z`)) };
  }, [locale]);
  const blocking = issues.filter((i) => i.blocking);
  const informational = issues.filter((i) => !i.blocking);

  const labelQuestion = (i: IssueProjection) =>
    i.key && i.label ? (
      <EvidenceLabelResolveForm
        action={actions.resolveLabel}
        sessionId={sessionId}
        labelKey={i.key}
        sourceLabel={i.label}
        defaultChoice={i.kind === "place_from_text" ? "create" : undefined}
        candidates={[
          ...(i.candidates.length > 0 ? i.candidates.map((c) => ({ value: c.id, label: c.name })) : i.kind === "ambiguous_place" ? workObjects : []),
          ...i.siblings.map((n) => ({ value: `alias:${n}`, label: n })),
        ]}
        labels={labels.label}
      />
    ) : null;

  const why = (kind: string) => (
    <details className="rounded-md border border-ink-600">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 font-mono text-meta uppercase tracking-label text-text-muted">
        <SemanticIcon concept="unknown" label={labels.whyLabel} className="h-3.5 w-3.5" />
        {labels.whyLabel}
      </summary>
      <p className="px-3 pb-3 text-meta leading-relaxed text-text-secondary">{labels.why(kind)}</p>
    </details>
  );

  return (
    <section className="flex flex-col gap-4" data-testid="historical-attention" data-blocking={blocking.length} data-informational={informational.length}>
      {blocking.length === 0 && informational.length === 0 && <p className="text-support text-text-muted">{labels.none}</p>}

      {blocking.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label={labels.decisions}>
          {blocking.map((i) => (
            <li key={`${i.kind}:${i.key ?? ""}`} className="flex flex-col gap-3 rounded-lg bg-ink-800/40 p-3 ring-1 ring-brand-orange/30" data-testid="evidence-issue" data-kind={i.kind} data-blocking="true" data-count={i.count}>
              <h3 className="flex items-center gap-2 text-support font-semibold text-text-primary">
                <SemanticIcon concept="warning" label={labels.decisions} className="h-4 w-4 text-brand-orange" />
                {labels.issue(i.kind, { count: i.count, label: i.label ?? "" })}
              </h3>

              {i.kind === "time_semantics" && (
                <ul className="flex flex-col gap-1.5" data-testid="evidence-time-rows">
                  {i.timeRows.map((r) => (
                    <li key={r.rowId} className="flex flex-col gap-1 py-2" data-testid="evidence-time-row">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-2">
                          <span aria-hidden className={cn(TILE, "h-8 w-8 text-meta")}>{playerInitials(r.label)}</span>
                          <span className="sr-only">{labels.person}</span>
                          <span className="text-support font-semibold text-text-primary">{r.label}</span>
                        </span>
                        <span className="font-display text-card-title font-bold tabular-nums text-state-amber">{labels.sum} {fmt.hours(r.sourceHours)} h</span>
                        {r.recordedOn && (
                          <span className="inline-flex items-center gap-1 font-mono text-meta tabular-nums text-text-secondary">
                            <SemanticIcon concept="calendar" label={labels.period} className="h-3 w-3" />
                            {fmt.day(r.recordedOn)}
                          </span>
                        )}
                        <span className={cn(TOKEN, "text-state-amber")} title={labels.machineReading[r.machineReading]}>
                          {labels.detected}: {r.machineReading === "period_aggregate" ? labels.machineReading.period_aggregate : "?"}
                        </span>
                        <span className={TOKEN} title={labels.remote}>
                          <SemanticIcon concept="remote" label={labels.remote} className="h-3 w-3" />
                          {r.remote === true ? "✓" : r.remote === false ? "✕" : "?"}
                        </span>
                        <span className={TOKEN} title={labels.period}>
                          <SemanticIcon concept="time" label={labels.period} className="h-3 w-3" />
                          {labels.unknown}
                        </span>
                      </div>
                      {(r.text || r.context || r.periodWords) && (
                        <details>
                          <summary className="flex min-h-8 cursor-pointer items-center gap-1 font-mono text-meta uppercase tracking-label text-text-muted">
                            <SemanticIcon concept="source" label={labels.source} className="h-3 w-3" />
                            {labels.source}
                          </summary>
                          <div className="flex flex-col gap-0.5 pt-1 text-meta text-text-secondary">
                            {r.context && <span>{r.context}</span>}
                            {r.text && <span className="italic leading-relaxed">“{r.text}”</span>}
                            {r.periodWords && <span className="text-text-muted">“{r.periodWords}”</span>}
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {i.kind === "time_semantics" && (
                <EvidenceTimeSemanticsForm
                  action={actions.resolveTime}
                  sessionId={sessionId}
                  rowIds={i.rowIds}
                  suggestedKind={i.timeRows.every((r) => r.machineReading === "period_aggregate") ? "period_aggregate" : "unknown"}
                  suggestedRemote={i.timeRows.some((r) => r.remote === true) ? true : null}
                  labels={labels.time}
                />
              )}
              {(i.kind === "ambiguous_place" || i.kind === "place_from_text") && labelQuestion(i)}
              {i.kind === "ambiguous_person" && i.sample && <p className="text-meta text-text-secondary">{i.sample}</p>}
              {why(i.kind)}
            </li>
          ))}
        </ul>
      )}

      {informational.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="evidence-issues-informational">
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.observations}</span>
          <ul className="flex flex-col gap-2">
            {informational.map((i) => (
              <li key={`${i.kind}:${i.key ?? ""}`} data-testid="evidence-issue" data-kind={i.kind} data-blocking="false" data-count={i.count}>
                <details className="rounded-md border border-ink-600">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-support text-text-secondary">
                    <SemanticIcon concept={i.kind === "allocation_inconsistent" || i.kind === "conflicts" || i.kind === "week_conflicts" ? "warning" : "unknown"} label={labels.observations} className="h-4 w-4 text-text-muted" />
                    <span className="flex-1">{labels.issue(i.kind, { count: i.count, label: i.label ?? "" })}</span>
                  </summary>
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    {i.sample && i.kind !== "place_from_text" && <p className="text-meta text-text-muted">{i.sample}</p>}
                    {(i.kind === "ambiguous_place" || i.kind === "place_from_text") && labelQuestion(i)}
                    <p className="text-meta leading-relaxed text-text-secondary">{labels.why(i.kind)}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
