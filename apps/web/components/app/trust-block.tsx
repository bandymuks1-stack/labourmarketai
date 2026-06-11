import { ShieldCheck, ClipboardCheck, NotebookPen } from "lucide-react";

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
 */
export interface TrustBlockLabels {
  readonly title: string;
  readonly caption: string;
  readonly verifiedSkills: string;
  readonly managerConfirmations: string;
  readonly journalEntries: string;
  readonly zeroHint: string;
}

export function TrustBlock({
  signals,
  labels,
}: {
  readonly signals: OwnTrustSignals;
  readonly labels: TrustBlockLabels;
}) {
  const allZero =
    signals.verifiedSkills === 0 &&
    signals.managerConfirmations === 0 &&
    signals.journalEntries === 0;
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
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
          highlight={signals.verifiedSkills > 0}
          testId="trust-verified-skills"
        />
        <Stat
          value={signals.managerConfirmations}
          label={labels.managerConfirmations}
          icon={<ClipboardCheck className="h-3.5 w-3.5" aria-hidden />}
          highlight={signals.managerConfirmations > 0}
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
      {allZero ? (
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
  readonly value: number;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly highlight: boolean;
  readonly testId: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-ink-800/30 p-3",
        // Quiet earned glow — only when the real count is non-zero.
        highlight ? "border-state-success/30 bg-state-success/5" : "border-ink-600",
      )}
    >
      <dt
        className={cn(
          "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label",
          highlight ? "text-state-success" : "text-text-muted",
        )}
      >
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-mono text-2xl font-bold tracking-tightest",
          highlight ? "text-state-success" : "text-text-primary",
        )}
        data-testid={testId}
      >
        <CountUp text={String(value)} />
      </dd>
    </div>
  );
}
