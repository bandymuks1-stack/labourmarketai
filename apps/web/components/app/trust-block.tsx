import { Layers, Eye, NotebookPen } from "lucide-react";

import type { OwnTrustSignals } from "@/lib/profile/trust-signals";
import { CountUp } from "@/components/app/today/count-up";
import { cn } from "@/lib/utils";

/**
 * Honest trust block (Workstream C; living-arena re-skin in TASK 07 slice
 * t07-1-typography-living-arena) — the visible end of the trust chain:
 * declared skills → journal entries → manager confirmations → portable
 * trust on the human.
 *
 * DESIGN_SOUL §1: a stat glows ONLY when the real count behind it is
 * non-zero — green for manager-verified facts, never for ambition. Zero
 * renders as a plain zero with the growth hint (Augimo testas), never
 * inflated, never "verified" without the manager-confirmed flag behind it.
 *
 * AND A COUNT WE COULD NOT READ IS NOT A ZERO. `null` renders as an em dash
 * with a line saying so, and it SUPPRESSES the growth hint — because offering
 * someone the how-to-get-started advice when the truth may be twelve
 * confirmations is the one thing this block must never do. Zero keeps its
 * ordinary meaning: checked, and there is none yet.
 */
export interface TrustBlockLabels {
  readonly title: string;
  readonly caption: string;
  readonly verifiedSkills: string;
  readonly managerConfirmations: string;
  readonly journalEntries: string;
  readonly zeroHint: string;
  /** Shown when at least one count could not be read. */
  readonly unreadHint: string;
}

export function TrustBlock({
  signals,
  labels,
}: {
  readonly signals: OwnTrustSignals;
  readonly labels: TrustBlockLabels;
}) {
  const counts = [
    signals.verifiedSkills,
    signals.managerConfirmations,
    signals.journalEntries,
  ];
  const anyUnread = counts.some((c) => c === null);
  // Every count CHECKED, and every one of them zero. An unread count makes
  // this unknowable, so the growth hint stays away rather than guessing.
  const allZero = !anyUnread && counts.every((c) => c === 0);
  return (
    <section
      className="card-border rise-in flex flex-col gap-4 p-5"
      data-testid="profile-trust-block"
    >
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tightest text-text-primary">
          {labels.title}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{labels.caption}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          value={signals.verifiedSkills}
          label={labels.verifiedSkills}
          icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
          highlight={(signals.verifiedSkills ?? 0) > 0}
          testId="trust-verified-skills"
        />
        <Stat
          value={signals.managerConfirmations}
          label={labels.managerConfirmations}
          icon={<Eye className="h-3.5 w-3.5" aria-hidden />}
          highlight={(signals.managerConfirmations ?? 0) > 0}
          testId="trust-confirmations"
        />
        <Stat
          value={signals.journalEntries}
          label={labels.journalEntries}
          icon={<NotebookPen className="h-3.5 w-3.5" aria-hidden />}
          highlight={false}
          testId="trust-entries"
        />
      </dl>
      {anyUnread ? (
        <p
          className="rounded-md border border-state-warning/40 bg-state-warning/10 px-3 py-2 text-xs leading-relaxed text-text-secondary"
          data-testid="trust-unread-hint"
        >
          {labels.unreadHint}
        </p>
      ) : allZero ? (
        <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted">
          {labels.zeroHint}
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  value,
  label,
  icon,
  highlight,
  testId,
}: {
  /** null = the read failed. Rendered as an em dash, never as 0. */
  readonly value: number | null;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly highlight: boolean;
  readonly testId: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-ink-800/30 p-3",
        // Silent-trust rule: no green "verified" glow. A non-zero count gets a
        // quiet neutral emphasis only — never a certification/trust badge.
        highlight ? "border-ink-500 bg-ink-800/50" : "border-ink-600",
      )}
    >
      <dt
        className="flex items-center gap-1.5 font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {icon}
        {label}
      </dt>
      <dd
        className="mt-1 font-mono text-2xl font-bold tracking-tightest text-text-primary"
        data-testid={testId}
      >
        {value === null ? (
          <span aria-hidden>—</span>
        ) : (
          <CountUp text={String(value)} />
        )}
      </dd>
    </div>
  );
}
