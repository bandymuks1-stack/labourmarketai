import type { ReactNode } from "react";
import { CvWorkMap } from "@/components/app/cv/cv-work-map";

export interface CvSkillOverviewRow {
  readonly key: string;
  readonly name: string;
  readonly tier: string;
  readonly level: "confirmed" | "recorded" | "declared";
  /** A specific activity from the canonical work source, never inferred from the skill label. */
  readonly activity: string | null;
  /** Project, engagement or work context for the activity, when the source provides it. */
  readonly context: string | null;
  /** Exact time attributed to this skill alone; null when the source does not allocate it. */
  readonly attributedHours: string | null;
  /** Overall participation time whose individual skill share is unknown; never a skill total. */
  readonly involvementHours: string | null;
  /** Separate confirmation/provenance statement; never imply confirmation from activity alone. */
  readonly confirmation: string | null;
  readonly detail: string | null;
  /** Share of attributed journal time, never a proficiency score. */
  readonly share: number | null;
  readonly shareLabel: string | null;
  readonly connections: readonly {
    readonly key: string;
    readonly label: string;
    readonly detail?: string;
    readonly meta?: string;
  }[];
}

/** The own-CV skill-to-work graph, projected only from supplied canonical links. */
export function CvSkillOverview({
  title,
  leftLabel,
  rightLabel,
  basis,
  attributedLabel,
  activityLabel,
  locale,
  rows,
  action,
}: {
  readonly title: string;
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly basis: string | null;
  readonly attributedLabel?: string | null;
  readonly activityLabel?: string | null;
  readonly locale?: string;
  readonly rows: readonly CvSkillOverviewRow[];
  readonly action: ReactNode;
}) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 6);
  const leftNodes = shown.map((row) => {
    const detail = (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-meta font-medium text-text-secondary">{row.tier}</p>
        {row.activity ? (
          <figure className="min-w-0">
            {activityLabel ? <figcaption className="text-meta text-text-muted" lang={locale}>{activityLabel}</figcaption> : null}
            <blockquote className="min-w-0 text-sm font-normal leading-relaxed text-text-primary [overflow-wrap:anywhere]">{row.activity}</blockquote>
          </figure>
        ) : null}
        {row.context ? <p className="min-w-0 text-meta leading-relaxed text-text-secondary [overflow-wrap:anywhere]">{row.context}</p> : null}
        {row.attributedHours && attributedLabel ? (
          <p className="min-w-0 text-meta leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
            <span className="text-text-muted">{attributedLabel}: </span>
            <span className="font-semibold tabular-nums text-text-primary">{row.attributedHours}</span>
          </p>
        ) : null}
        {row.involvementHours ? <p className="min-w-0 text-meta leading-relaxed text-text-secondary [overflow-wrap:anywhere]">{row.involvementHours}</p> : null}
        {row.confirmation ? <p className="min-w-0 text-meta font-medium leading-relaxed text-state-success [overflow-wrap:anywhere]">{row.confirmation}</p> : null}
        {row.detail ? <p className="min-w-0 text-meta leading-relaxed text-text-muted [overflow-wrap:anywhere]">{row.detail}</p> : null}
      </div>
    );
    const meta = row.attributedHours && attributedLabel ? row.attributedHours : undefined;
    return { id: `skill:${encodeURIComponent(row.key)}`, label: row.name, side: "left" as const, meta, level: row.level, detail };
  });
  const nodeByConnection = new Map<string, { id: string; label: string; side: "right"; meta?: string; detail?: ReactNode }>();
  // Select one available example per skill first. A prolific first skill must
  // not consume all work nodes and make other documented skills look unlinked.
  const preferredConnections = [...shown.flatMap((row) => row.connections.slice(0, 1)), ...shown.flatMap((row) => row.connections)];
  for (const connection of preferredConnections) {
    if (nodeByConnection.has(connection.key) || nodeByConnection.size >= 6) continue;
    const labelPoints = Array.from(connection.label);
    const label = labelPoints.length > 60 ? `${labelPoints.slice(0, 60).join("").trimEnd()}…` : connection.label;
    const originalDetail = connection.detail ?? (label !== connection.label ? connection.label : undefined);
    const detail = label !== connection.label && originalDetail && !originalDetail.includes(connection.label)
      ? `${connection.label}\n${originalDetail}`
      : originalDetail;
    nodeByConnection.set(connection.key, {
      id: `connection:${encodeURIComponent(connection.key)}`,
      label,
      side: "right",
      ...(connection.meta ? { meta: connection.meta } : {}),
      ...(detail ? { detail: <p className="min-w-0 whitespace-pre-line text-sm leading-relaxed text-text-primary [overflow-wrap:anywhere]">{detail}</p> } : {}),
    });
  }
  const edges: { from: string; to: string }[] = [];
  const edgeKeys = new Set<string>();
  for (const row of shown) {
    const from = `skill:${encodeURIComponent(row.key)}`;
    for (const connection of row.connections) {
      const id = `connection:${encodeURIComponent(connection.key)}`;
      if (!nodeByConnection.has(connection.key)) continue;
      const edgeKey = `${from}\u0000${id}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      edges.push({ from, to: id });
    }
  }
  const nodes = [...leftNodes, ...nodeByConnection.values()];
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="cv-overview-skills">
      <CvWorkMap title={title} leftLabel={leftLabel} rightLabel={rightLabel} nodes={nodes} edges={edges} action={action} />
      {basis ? <p className="text-meta leading-relaxed text-text-muted">{basis}</p> : null}
    </div>
  );
}

export interface CvEvidenceSlice {
  readonly key: "actual" | "reported" | "estimated" | "confirmed";
  readonly label: string;
  readonly hours: number;
  readonly value: string;
}

const SLICE_STROKE: Record<CvEvidenceSlice["key"], string> = {
  actual: "stroke-text-secondary",
  reported: "stroke-brand-blue",
  estimated: "stroke-ink-500",
  confirmed: "stroke-brand-cyan",
};
const SLICE_DOT: Record<CvEvidenceSlice["key"], string> = {
  actual: "bg-text-secondary",
  reported: "bg-brand-blue",
  estimated: "bg-ink-500",
  confirmed: "bg-brand-cyan",
};
const SLICE_FILL: Record<CvEvidenceSlice["key"], string> = {
  actual: "bg-text-secondary",
  reported: "bg-brand-blue",
  estimated: "bg-ink-500",
  confirmed: "bg-brand-cyan",
};

/** Mutually exclusive states from the canonical, capacity-adjusted hours ledger. */
export function CvEvidenceMix({
  title,
  total,
  totalValue,
  totalLabel,
  locale,
  slices,
  scope,
  action,
}: {
  readonly title: string;
  readonly total: number;
  /** Already localized/formatted total, including its unit. */
  readonly totalValue: string;
  /** Existing localized label describing what the total represents. */
  readonly totalLabel: string;
  readonly locale: string;
  readonly slices: readonly CvEvidenceSlice[];
  readonly scope: readonly string[];
  readonly action: ReactNode;
}) {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (slices.some((slice) => !Number.isFinite(slice.hours) || slice.hours < 0)) return null;
  const shown = slices.filter((slice) => slice.hours > 0);
  const sum = shown.reduce((value, slice) => value + slice.hours, 0);
  // A composition must describe the actual total, never a second total.
  // Four individually rounded states and a rounded total can differ by up
  // to 0.025 h. Larger differences are not a valid composition.
  if (shown.length === 0 || Math.abs(sum - total) > 0.025) return null;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  let offset = 0;
  return (
    <details className="min-w-0 rounded-2xl border border-border-subtle bg-surface-1/70 p-4 sm:p-5" data-testid="cv-overview-evidence">
      <summary className="cursor-pointer list-none font-display text-lg font-semibold text-text-primary marker:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">{title}</summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        <header className="flex flex-wrap items-center justify-end gap-2">{action}</header>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border-subtle pb-2 text-meta" data-testid="cv-evidence-total">
          <span className="text-text-muted">{totalLabel}</span>
          <span className="font-semibold tabular-nums text-text-secondary">{totalValue}</span>
        </div>
        <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[5rem_minmax(0,1fr)]">
          <div className="relative mx-auto size-[4.5rem] sm:size-[5rem]" data-testid="cv-evidence-chart">
            <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden="true">
              {shown.map((slice) => {
                const share = slice.hours / sum * 100;
                const start = offset;
                offset += share;
                return <circle key={slice.key} cx="40" cy="40" r="31" pathLength="100" fill="none" strokeWidth="9" className={SLICE_STROKE[slice.key]} strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start} />;
              })}
            </svg>
          </div>

          <dl className="flex min-w-0 flex-col gap-1.5" data-testid="cv-evidence-legend">
            {shown.map((slice) => {
              const share = slice.hours / sum;
              return (
                <div key={slice.key} className="flex min-w-0 flex-col gap-1" data-evidence-state={slice.key}>
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <dt className="flex min-w-0 items-center gap-1.5 text-meta leading-snug text-text-secondary [overflow-wrap:anywhere]">
                      <span className={`inline-block size-2 shrink-0 rounded-full ${SLICE_DOT[slice.key]}`} aria-hidden="true" />
                      {slice.label}
                    </dt>
                    <dd className="shrink-0 tabular-nums text-meta font-semibold text-text-primary">{slice.value}<span className="ml-1 font-normal text-text-muted">{percent.format(share)}</span></dd>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true" data-testid="cv-evidence-share-track">
                    <div className={`h-full rounded-full ${SLICE_FILL[slice.key]}`} style={{ width: `${share * 100}%` }} data-testid="cv-evidence-share" data-share={share} />
                  </div>
                </div>
              );
            })}
          </dl>
        </div>
        {scope.length > 0 ? <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3 text-meta leading-relaxed text-text-muted">{scope.map((line) => <p key={line}>{line}</p>)}</div> : null}
      </div>
    </details>
  );
}
